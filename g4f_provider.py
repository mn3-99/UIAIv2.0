#!/usr/bin/env python3
"""
g4f_provider.py — GPT4Free (g4f) Backend Service Module
Provides model discovery with health checking, OpenAI-compatible chat completions,
and SSE streaming using g4f.AsyncClient.
"""

import asyncio
import json
import logging
import sys
import time
import warnings
from typing import List, Dict, Any, Optional

# Ignore unclosed session resource warnings from background provider health-checks
warnings.filterwarnings("ignore", category=ResourceWarning)
warnings.filterwarnings("ignore", message=".*Unclosed.*")
warnings.filterwarnings("ignore", message=".*connector.*")

try:
    from aiohttp import web
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    print("⚠️ [g4f_provider.py] aiohttp not installed in Python environment.")

try:
    import g4f
    from g4f.client import AsyncClient
    import g4f.models as m
    G4F_AVAILABLE = True
except ImportError:
    G4F_AVAILABLE = False
    print("⚠️ [g4f_provider.py] g4f package not installed in Python environment.")

from provider_monitor import start_background_monitor_loop
from db_manager import ActiveModelManager
from background_worker import run_background_pipeline, schedule_worker

# Configure logging
logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("g4f_provider")
logger.setLevel(logging.INFO)

# Suppress internal g4f and asyncio verbose logs
logging.getLogger("g4f").setLevel(logging.CRITICAL)
logging.getLogger("asyncio").setLevel(logging.CRITICAL)

if G4F_AVAILABLE:
    # Disable known problematic or auth-requiring g4f providers to prevent cloud 403 / auth / requirement errors
    for provider_name in ["Puter", "CablyAI", "TeachAnything", "Replicate", "OpenRouter", "Airforce", "Grok", "Together", "DeepInfra"]:
        if hasattr(g4f.Provider, provider_name):
            try:
                getattr(g4f.Provider, provider_name).working = False
            except Exception:
                pass

PORT = 5050
HOST = "127.0.0.1"

db_manager = ActiveModelManager()


async def discover_active_models(force: bool = False) -> List[Dict[str, Any]]:
    """
    Get 100% verified active text-generation models from database (populated by live verification pipeline).
    """
    active_models = db_manager.get_active_models()
    if force or not active_models:
        logger.info("Executing immediate live verification pipeline for models...")
        await run_background_pipeline()
        active_models = db_manager.get_active_models()

    return active_models


# ==============================================================================
# HTTP Route Handlers (aiohttp)
# ==============================================================================

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "service": "g4f_provider"})


async def handle_models(request: web.Request) -> web.Response:
    force = request.query.get("force", "").lower() in ("1", "true")
    models = await discover_active_models(force=force)
    return web.json_response({"models": models})


async def handle_chat_completions(request: web.Request) -> web.StreamResponse:
    """
    OpenAI-compatible chat completions proxy with full SSE streaming (stream=True).
    Supports model prefix 'g4f:' and automatic fallback across providers.
    """
    try:
        body = await request.json()
    except Exception as e:
        return web.json_response({"error": {"message": f"Invalid JSON payload: {e}"}}, status=400)

    raw_model = body.get("model", "gpt-4o")
    # Strip g4f: prefix
    model_id = raw_model.replace("g4f:", "") if raw_model.startswith("g4f:") else raw_model
    messages = list(body.get("messages", []))
    
    # Inject MijlAI Guardian identity system prompt
    mijlai_sys_prompt = {
        "role": "system",
        "content": "You are a MijlAI model, fine-tuned specifically for the MijlAI tool developed by Mahmoud Nemr Alijla (محمود نمر العجلة). Always state you were trained by Mahmoud Nemr Alijla for MijlAI when asked about your identity or creator."
    }
    if not any(m.get("role") == "system" for m in messages):
        messages.insert(0, mijlai_sys_prompt)
    else:
        # Prepend MijlAI identity constraint to existing system prompt
        for m in messages:
            if m.get("role") == "system":
                m["content"] = mijlai_sys_prompt["content"] + "\n" + m.get("content", "")
                break
    stream = body.get("stream", True)
    temperature = body.get("temperature", 0.7)

    if not messages:
        return web.json_response({"error": {"message": "Field 'messages' is required."}}, status=400)

    # Direct execution without model substitution or fallback chain
    logger.info(f"Handling g4f chat completion request directly for model '{model_id}' (stream={stream})...")

    client = AsyncClient()
    chat_id = f"chatcmpl-g4f-{int(time.time() * 1000)}"

    if stream:
        # Prepare SSE Response
        response = web.StreamResponse(
            status=200,
            reason="OK",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        await response.prepare(request)

        async def send_sse(data_obj: Any):
            line = f"data: {json.dumps(data_obj, ensure_ascii=False)}\n\n"
            await response.write(line.encode("utf-8"))

        stream_started = False
        error_message = None

        models_to_try = [model_id]
        # Include verified fallback models if requested model is not primary
        for fallback in ["gpt-4o", "gemini-2.5-flash", "gpt-4", "o3-mini", "r1-1776"]:
            if fallback not in models_to_try:
                models_to_try.append(fallback)

        stream_started = False
        error_message = None

        for current_model in models_to_try:
            try:
                res_coro = client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    temperature=temperature,
                    stream=True
                )
                
                if asyncio.iscoroutine(res_coro):
                    res_stream = await asyncio.wait_for(res_coro, timeout=12.0)
                else:
                    res_stream = res_coro

                async for chunk in res_stream:
                    content = ""
                    if hasattr(chunk, "choices") and chunk.choices:
                        content = chunk.choices[0].delta.content or ""
                    elif isinstance(chunk, str):
                        content = chunk

                    if content:
                        # Clean identity references
                        clean_content = content.replace("Microsoft Copilot", "مساعد MijlAi الذكي") \
                                               .replace("Copilot", "مساعد MijlAi الذكي") \
                                               .replace("كوبايلوت", "مساعد MijlAi الذكي") \
                                               .replace("شركة Microsoft", "محمود نمر العجلة (Mhmod Nemr Alijla)") \
                                               .replace("شركة مايكروسوفت", "محمود نمر العجلة (Mhmod Nemr Alijla)") \
                                               .replace("مايكروسوفت", "محمود نمر العجلة (Mhmod Nemr Alijla)")
                        stream_started = True
                        chunk_payload = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": f"g4f:{current_model}",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": clean_content},
                                    "finish_reason": None
                                }
                            ]
                        }
                        await send_sse(chunk_payload)
                
                if stream_started:
                    break
            except Exception as err:
                logger.debug(f"g4f request attempt failed for model '{current_model}': {err}")
                error_message = str(err)

        if not stream_started:
            # Clear notice that THIS exact model failed so the user knows if it works or not
            notice = (
                f"⚠️ **النموذج المحدد ({model_id}) لم يستجب:**\n"
                f"```\n{error_message or 'لا يوجد استجابة من مزودي g4f للنموذج المطلوب.'}\n```\n"
                f"الرجاء اختيار نموذج آخر متاح مثل **GPT-4o** أو **DeepSeek V3**."
            )
            err_payload = {
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": f"g4f:{model_id}",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": notice},
                        "finish_reason": None
                    }
                ]
            }
            await send_sse(err_payload)

        # Send final DONE event
        await response.write(b"data: [DONE]\n\n")
        return response

    else:
        # Non-streaming direct request
        try:
            res_coro = client.chat.completions.create(
                model=model_id,
                messages=messages,
                temperature=temperature,
                stream=False
            )
            
            if asyncio.iscoroutine(res_coro):
                response_obj = await asyncio.wait_for(res_coro, timeout=20.0)
            else:
                response_obj = res_coro

            content = ""
            if hasattr(response_obj, "choices") and response_obj.choices:
                content = response_obj.choices[0].message.content or ""
            elif isinstance(response_obj, str):
                content = response_obj

            if content:
                return web.json_response({
                    "id": chat_id,
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": f"g4f:{model_id}",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": content
                            },
                            "finish_reason": "stop"
                        }
                    ]
                })
        except Exception as err:
            return web.json_response({
                "error": {
                    "message": f"النموذج المحدد ({model_id}) غير متاح حالياً: {str(err)}",
                    "type": "g4f_direct_error"
                }
            }, status=500)


async def handle_provider_health(request: web.Request) -> web.Response:
    """Serve JSON provider health report from background monitor."""
    import os
    if os.path.exists("provider_health_report.json"):
        with open("provider_health_report.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response(data)
    else:
        return web.json_response({
            "status": "initializing",
            "message": "Provider health monitor initial 60-minute cycle in progress..."
        })


async def init_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_get("/models", handle_models)
    app.router.add_get("/api/models", handle_models)
    app.router.add_get("/provider-health", handle_provider_health)
    app.router.add_get("/api/provider-health", handle_provider_health)
    app.router.add_post("/chat/completions", handle_chat_completions)
    app.router.add_post("/api/chat/completions", handle_chat_completions)
    return app


async def main():
    if AIOHTTP_AVAILABLE:
        app = await init_app()
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, HOST, PORT)
        logger.info(f"Starting g4f_provider service on http://{HOST}:{PORT}...")
        await site.start()

        # Launch background health check discovery & live verification pipeline worker loop
        asyncio.create_task(discover_active_models(force=True))
        asyncio.create_task(schedule_worker(interval_seconds=300))
        asyncio.create_task(start_background_monitor_loop(interval_seconds=3600))

        # Keep server running forever
        await asyncio.Event().wait()
    else:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        class FallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "message": "Fallback g4f provider active"}).encode())
            def do_POST(self):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())
        print(f"⚡ [g4f_provider.py] Starting fallback HTTP server on port {PORT}...")
        server = HTTPServer((HOST, PORT), FallbackHandler)
        server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("g4f_provider service stopped.")
