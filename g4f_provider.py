#!/usr/bin/env python3
"""
g4f_provider.py — GPT4Free (g4f) Backend Service Module
Provides model discovery with health checking, OpenAI-compatible chat completions,
and SSE streaming using g4f.AsyncClient.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
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
    # Auto-disable every provider that requires credentials/HAR files/cookies
    for provider_name in dir(g4f.Provider):
        if provider_name.startswith('_'):
            continue
        try:
            p = getattr(g4f.Provider, provider_name)
            if getattr(p, 'needs_auth', False):
                p.working = False
        except Exception:
            pass
    # Disable known problematic or environment-incompatible providers (browser-dependent, PoW-gated, blocked from datacenter IPs)
    for provider_name in ["Puter", "CablyAI", "TeachAnything", "Replicate", "OpenRouter", "Airforce",
                          "Grok", "Together", "DeepInfra", "Cloudflare", "Copilot", "CopilotApp",
                          "OpenaiChat", "Pollinations", "PollinationsAudio", "Groq", "Nvidia",
                          "Ollama", "GeminiPro", "MetaAI", "OperaAria", "Qwen", "GLM", "PhindAi"]:
        if hasattr(g4f.Provider, provider_name):
            try:
                getattr(g4f.Provider, provider_name).working = False
            except Exception:
                pass

PORT = 5050
HOST = "127.0.0.1"

db_manager = ActiveModelManager()

# ------------------------------------------------------------------------------
# Live-verified provider routing (probed from this server on deploy).
# Ordered by reliability: fast no-auth endpoints first.
# ------------------------------------------------------------------------------
DEFAULT_PROVIDER_ORDER = ["Yqcloud", "Gemini", "Perplexity", "CohereForAI_C4AI_Command"]

MODEL_PROVIDER_ROUTES: Dict[str, List[str]] = {
    "gemini": ["Gemini"],
    "gemini-2.5-flash": ["Gemini"],
    "gemini-2.5-pro": ["Gemini"],
    "gemini-3.6-flash": ["Gemini"],
    "gemini-auto": ["Gemini"],
    "command-a": ["CohereForAI_C4AI_Command"],
    "command-r": ["CohereForAI_C4AI_Command"],
    "command-r-plus": ["CohereForAI_C4AI_Command"],
    "c4ai-command": ["CohereForAI_C4AI_Command"],
    "sonar": ["Perplexity"],
    "sonar-pro": ["Perplexity"],
    "r1-1776": ["Perplexity"],
}


def resolve_providers_for_model(model_id: str) -> List[Any]:
    """Return ordered list of instantiated-capable provider classes for a model."""
    names = MODEL_PROVIDER_ROUTES.get(model_id, []) + DEFAULT_PROVIDER_ORDER
    resolved, seen = [], set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        p = getattr(g4f.Provider, name, None)
        if p is not None and getattr(p, 'working', False):
            resolved.append(p)
    return resolved


def build_fallback_chain(model_id: str) -> List[str]:
    """Requested model first, then DB-verified active models, then static safety nets."""
    chain = [model_id]
    try:
        for m in db_manager.get_active_models():
            mid = (m.get("id") or "").replace("g4f:", "")
            if mid and mid not in chain:
                chain.append(mid)
    except Exception:
        pass
    for fb in ["gpt-4o-mini", "gemini", "command-a", "gpt-4o"]:
        if fb not in chain:
            chain.append(fb)
    return chain


# ------------------------------------------------------------------------------
# Direct OpenAI-compatible free endpoints (sourced from GitHub open-source lists:
# cheahjs/free-llm-api-resources, 0xzr/freellmpool, tashfeenahmed/freellmapi).
# These work WITHOUT any API key and are used as an independent fallback layer
# when g4f web providers fail. Optional keys are read from environment.
# ------------------------------------------------------------------------------
def _mijlai_pwr_key() -> Optional[str]:
    """Read the MijlAI-PWR (DigitalOcean agent) key from env, falling back to .env."""
    key = os.getenv("MIJLAI_PWR_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("MIJLAI_PWR_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


DIRECT_ENDPOINTS: List[Dict[str, Any]] = [
    {
        "name": "kilo",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        # Anonymous tier (~200 req/h per IP). Coding-agent-grade free models,
        # OpenAI-compatible SSE, several models emit `reasoning` deltas.
        "models": ["kilo-auto/free", "stepfun/step-3.7-flash:free", "tencent/hy3:free",
                   "poolside/laguna-s-2.1:free", "meituan/longcat-2.0-free"],
        "default_model": "kilo-auto/free",
    },
    {
        "name": "pollinations",
        "url": "https://text.pollinations.ai/openai",
        "api_key": None,
        # Keyless GPT-backed endpoint, streams SSE
        "models": ["openai", "openai-fast", "openai-large", "mistral", "qwen-coder", "llama"],
        "default_model": "openai-fast",
    },
    {
        "name": "ovhcloud",
        "url": "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
        "api_key": None,
        # Anonymous EU tier: strong coding models, rate-limited per IP
        "models": ["Qwen3-Coder-30B-A3B-Instruct", "Qwen3.6-27B", "Meta-Llama-3_3-70B-Instruct", "Qwen3-32B"],
        "default_model": "Qwen3-Coder-30B-A3B-Instruct",
    },
    {
        "name": "llm7",
        "url": "https://api.llm7.io/v1/chat/completions",
        "api_key": os.getenv("LLM7_API_KEY", "unused"),  # anonymous ~60 req/h; free token at token.llm7.io
        "models": ["DeepSeek-V4-Flash-0731", "gpt-4o-mini", "gemini-flash", "deepseek-r1"],
        "default_model": "DeepSeek-V4-Flash-0731",
    },
    {
        # MijlAI-PWR: dedicated DigitalOcean GenAI agent (OpenAI-compatible).
        # Keyed endpoint — tried first for the 'direct:mijlai-pwr' model tier.
        "name": "mijlai-pwr",
        "url": "https://l3y3mfzeo7nw5yxxenvf7xbw.agents.do-ai.run/api/v1/chat/completions",
        "api_key": _mijlai_pwr_key(),
        "models": ["mijlai-pwr"],
        "default_model": "mijlai-pwr",
        # DigitalOcean agents reject system/developer roles (agent instructions
        # live in the DO agent config) — fold them into user turns first.
        "no_system_role": True,
    },
]


def fold_system_messages_for_agent(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert system/developer messages into a user-role prefix.

    DigitalOcean GenAI agents reject system/developer roles with HTTP 400
    ('agent instructions are set via agent configuration'). Folding keeps the
    identity/style guidance visible to the model instead of dropping it.
    """
    sys_parts: List[str] = []
    convo: List[Dict[str, Any]] = []
    for m in messages:
        if m.get("role") in ("system", "developer"):
            content = m.get("content")
            if isinstance(content, str) and content.strip():
                sys_parts.append(content.strip())
            elif isinstance(content, list):
                texts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                joined = "\n".join(t for t in texts if t.strip())
                if joined.strip():
                    sys_parts.append(joined.strip())
        else:
            convo.append(dict(m))

    if not sys_parts:
        return convo

    prefix = "تعليمات النظام (التزم بها):\n" + "\n\n".join(sys_parts)
    if convo and convo[0].get("role") == "user":
        first = convo[0]
        if isinstance(first.get("content"), str):
            convo[0] = {**first, "content": prefix + "\n\n---\n\n" + first["content"]}
        elif isinstance(first.get("content"), list):
            convo[0] = {**first, "content": [{"type": "text", "text": prefix + "\n\n---\n"}] + first["content"]}
        else:
            convo.insert(0, {"role": "user", "content": prefix})
    else:
        convo.insert(0, {"role": "user", "content": prefix})
    return convo


def resolve_direct_endpoint(model_id: str) -> Optional[Dict[str, Any]]:
    """Pick the best direct endpoint for a model id, else the most reliable one."""
    low = model_id.lower()
    for ep in DIRECT_ENDPOINTS:
        if any(low == m.lower() or low in m.lower() or m.lower() in low for m in ep["models"]):
            return ep
    return None


# ------------------------------------------------------------------------------
# Circuit Breaker for direct endpoints: after N consecutive failures an endpoint
# is "open" (skipped) for COOLDOWN_S seconds so user requests never queue behind
# a dead provider. One success closes the circuit again.
# ------------------------------------------------------------------------------
class EndpointCircuitBreaker:
    FAILURE_THRESHOLD = 3
    COOLDOWN_S = 120

    def __init__(self):
        self._fail: Dict[str, int] = {}
        self._opened_at: Dict[str, float] = {}

    def is_open(self, name: str) -> bool:
        opened = self._opened_at.get(name)
        if opened is None:
            return False
        if time.time() - opened >= self.COOLDOWN_S:
            # half-open: allow one probe
            self._opened_at.pop(name, None)
            self._fail[name] = self.FAILURE_THRESHOLD - 1
            return False
        return True

    def record_failure(self, name: str) -> None:
        self._fail[name] = self._fail.get(name, 0) + 1
        if self._fail[name] >= self.FAILURE_THRESHOLD:
            self._opened_at[name] = time.time()

    def record_success(self, name: str) -> None:
        self._fail.pop(name, None)
        self._opened_at.pop(name, None)

    def snapshot(self) -> Dict[str, Dict[str, Any]]:
        out = {}
        for ep in DIRECT_ENDPOINTS:
            n = ep["name"]
            out[n] = {
                "failures": self._fail.get(n, 0),
                "circuit": "open" if self.is_open(n) else "closed",
            }
        return out


endpoint_breaker = EndpointCircuitBreaker()


async def attempt_direct_chat(request, messages, temperature, stream,
                              preferred_name: Optional[str] = None,
                              preferred_model: Optional[str] = None) -> Optional[web.Response]:
    """
    Independent fallback layer over keyless OpenAI-compatible endpoints.
    Returns a ready Response on success, or None if every endpoint failed.
    Supports both SSE streaming and plain JSON responses.
    When preferred_name is set, only that endpoint is tried with preferred_model.
    """
    import aiohttp

    endpoints = DIRECT_ENDPOINTS
    if preferred_name:
        endpoints = [ep for ep in DIRECT_ENDPOINTS if ep["name"] == preferred_name]

    for ep in endpoints:
        if endpoint_breaker.is_open(ep["name"]):
            logger.debug(f"[direct:{ep['name']}] circuit OPEN — skipping")
            continue
        payload_model = preferred_model or ep["default_model"]
        ep_messages = fold_system_messages_for_agent(messages) if ep.get("no_system_role") else messages
        body = {
            "model": payload_model,
            "messages": ep_messages,
            "temperature": max(0.0, min(temperature, 1.5)),
            "stream": bool(stream),
        }
        headers = {"Content-Type": "application/json"}
        if ep["api_key"]:
            headers["Authorization"] = f"Bearer {ep['api_key']}"

        try:
            # Local llama.cpp can be slower on shared CPU — give it more headroom
            timeout = aiohttp.ClientTimeout(total=300 if ep.get("local") else 90, connect=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(ep["url"], json=body, headers=headers) as upstream:
                    if upstream.status != 200:
                        logger.debug(f"[direct:{ep['name']}] HTTP {upstream.status}")
                        endpoint_breaker.record_failure(ep["name"])
                        continue

                    if not stream:
                        data = await upstream.json()
                        msg = {}
                        try:
                            msg = data["choices"][0]["message"]
                        except Exception:
                            pass
                        content = (msg.get("content") or "").strip()
                        # Fall back to reasoning text when the model only reasoned
                        if not content:
                            content = (msg.get("reasoning") or "").strip()
                        if not content:
                            content = str(data)[:500]
                        if not content.strip():
                            continue
                        endpoint_breaker.record_success(ep["name"])
                        return web.json_response({
                            "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                            "object": "chat.completion",
                            "created": int(time.time()),
                            "model": f"direct:{ep['name']}:{payload_model}",
                            "choices": [{
                                "index": 0,
                                "message": {"role": "assistant", "content": content},
                                "finish_reason": "stop"
                            }]
                        })

                    # Streaming path
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
                    chat_id = f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}"
                    sent_any = False

                    async for raw_line in upstream.content:
                        line = raw_line.decode("utf-8", errors="ignore").strip()
                        if not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            obj = json.loads(data_str)
                            delta_obj = obj.get("choices", [{}])[0].get("delta", {})
                            delta = delta_obj.get("content") or ""
                            reasoning = delta_obj.get("reasoning") or delta_obj.get("reasoning_content") or ""
                        except Exception:
                            continue

                        # Forward model reasoning as agentic thinking frames
                        if reasoning:
                            think_payload = {
                                "id": chat_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": f"direct:{ep['name']}:{payload_model}",
                                "choices": [{"index": 0, "delta": {"reasoning_content": reasoning}, "finish_reason": None}]
                            }
                            await response.write(f"data: {json.dumps({'t': 'think', 'd': reasoning}, ensure_ascii=False)}\n\n".encode("utf-8"))

                        if delta:
                            sent_any = True
                            chunk_payload = {
                                "id": chat_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": f"direct:{ep['name']}:{payload_model}",
                                "choices": [{"index": 0, "delta": {"content": delta}, "finish_reason": None}]
                            }
                            await response.write(f"data: {json.dumps(chunk_payload, ensure_ascii=False)}\n\n".encode("utf-8"))

                    if not sent_any:
                        try:
                            response.force_close()
                        except Exception:
                            pass
                        endpoint_breaker.record_failure(ep["name"])
                        continue
                    endpoint_breaker.record_success(ep["name"])
                    await response.write(b"data: [DONE]\n\n")
                    await response.write_eof()
                    return response
        except Exception as err:
            logger.debug(f"[direct:{ep['name']}] failed: {err}")
            endpoint_breaker.record_failure(ep["name"])
            continue

    return None


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
    # Strip g4f: / direct: prefixes
    preferred_direct = None
    if raw_model.startswith("direct:"):
        raw_model = raw_model.replace("direct:", "", 1)
        ep = resolve_direct_endpoint(raw_model)
        preferred_direct = ep["name"] if ep else None
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

    # Routed execution: each attempt uses a live-verified provider
    logger.info(f"Handling g4f chat completion request for model '{model_id}' (stream={stream})...")

    chat_id = f"chatcmpl-g4f-{int(time.time() * 1000)}"

    # Tier "direct:" models go to their pinned endpoint FIRST (e.g., MijlAi Coder -> OVH Qwen3-Coder)
    if preferred_direct:
        direct_res = await attempt_direct_chat(request, messages, temperature, stream,
                                               preferred_name=preferred_direct, preferred_model=model_id)
        if direct_res is not None:
            return direct_res
        logger.info(f"[direct:{preferred_direct}] unavailable for '{model_id}' — falling back to g4f chain")

    def build_attempts() -> List[tuple]:
        attempts: List[tuple] = []
        seen = set()

        def add(mid: str, provider: Any):
            key = (mid, provider.__name__)
            if key not in seen and getattr(provider, 'working', False):
                seen.add(key)
                attempts.append((mid, provider))

        for provider in resolve_providers_for_model(model_id):
            add(model_id, provider)

        for mid in build_fallback_chain(model_id)[1:]:
            for provider in resolve_providers_for_model(mid)[:2]:
                add(mid, provider)

        # Ultimate safety nets (probed working endpoints with their native models)
        add("gpt-4o-mini", g4f.Provider.Yqcloud)
        add("command-a", g4f.Provider.CohereForAI_C4AI_Command)
        return attempts

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

        for current_model, current_provider in build_attempts():
            try:
                client = AsyncClient(provider=current_provider)
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

                # Guard against rate-limit/ad pages masquerading as answers
                JUNK_MARKERS = ("aichatos", "限流", "请求过多", "微信", "kelemm220",
                                "请访问", "付费使用")
                first_chunk = True

                async for chunk in res_stream:
                    content = ""
                    if hasattr(chunk, "choices") and chunk.choices:
                        content = chunk.choices[0].delta.content or ""
                    elif isinstance(chunk, str):
                        content = chunk

                    if content:
                        # Reject junk/ad pages BEFORE committing to this provider
                        if first_chunk:
                            probe = content.strip()
                            if any(m in probe for m in JUNK_MARKERS) or (len(probe) > 80 and sum('\u4e00' <= c <= '\u9fff' for c in probe) > len(probe) * 0.3):
                                logger.info(f"[quality-guard] junk detected from {current_provider.__name__} — skipping provider")
                                raise ValueError("junk_response_detected")
                        first_chunk = False

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
                logger.debug(f"g4f request attempt failed for model '{current_model}' via {current_provider.__name__}: {err}")
                error_message = str(err)

        if not stream_started:
            # Layer 2: independent keyless OpenAI-compatible endpoints
            direct_res = await attempt_direct_chat(request, messages, temperature, stream=True)
            if direct_res is not None:
                return direct_res

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
        # Non-streaming routed request
        last_error = None
        for current_model, current_provider in build_attempts():
            try:
                client = AsyncClient(provider=current_provider)
                res_coro = client.chat.completions.create(
                    model=current_model,
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
                        "model": f"g4f:{current_model}",
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
                logger.debug(f"g4f non-stream attempt failed for '{current_model}' via {current_provider.__name__}: {err}")
                last_error = err

        direct_res = await attempt_direct_chat(request, messages, temperature, stream=False)
        if direct_res is not None:
            return direct_res

        return web.json_response({
            "error": {
                "message": f"النموذج المحدد ({model_id}) غير متاح حالياً: {str(last_error)}",
                "type": "g4f_direct_error"
            }
        }, status=500)


async def handle_provider_health(request: web.Request) -> web.Response:
    """Serve JSON provider health report + live circuit-breaker state."""
    import os
    payload: Dict[str, Any] = {"circuits": endpoint_breaker.snapshot()}
    if os.path.exists("provider_health_report.json"):
        with open("provider_health_report.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        payload.update(data if isinstance(data, dict) else {})
        return web.json_response(payload)
    else:
        payload.update({
            "status": "initializing",
            "message": "Provider health monitor initial 60-minute cycle in progress..."
        })
        return web.json_response(payload)


async def handle_search(request: web.Request) -> web.Response:
    """
    Keyless internet search endpoint (agentic web tool).
    Tries the `ddgs` / `duckduckgo_search` library, then falls back to
    DuckDuckGo HTML scraping. Returns normalized results.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    query = (body.get("query") or "").strip()
    max_results = min(int(body.get("max_results", 6) or 6), 10)
    if not query:
        return web.json_response({"error": "query is required"}, status=400)

    results = []

    # Strategy 1: ddgs library
    try:
        from ddgs import DDGS  # new package name
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href") or r.get("url", ""),
                    "snippet": r.get("body", "")
                })
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # legacy package name
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=max_results):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("href") or r.get("url", ""),
                        "snippet": r.get("body", "")
                    })
        except Exception as e:
            logger.debug(f"duckduckgo_search failed: {e}")
    except Exception as e:
        logger.debug(f"ddgs search failed: {e}")

    # Strategy 2: HTML fallback scrape of duckduckgo.com/html
    if not results:
        try:
            import aiohttp
            import re as _re
            headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"}
            timeout = aiohttp.ClientTimeout(total=15)
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.post("https://html.duckduckgo.com/html/", data={"q": query}) as resp:
                    html = await resp.text()
            items = _re.findall(
                r'<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>',
                html, _re.S)
            tag_clean = _re.compile(r"<[^>]+>")
            for href, title, snippet in items[:max_results]:
                if href.startswith("//duckduckgo.com/l/?uddg="):
                    from urllib.parse import unquote, urlparse
                    try:
                        href = unquote(urlparse("https:" + href).query.split("uddg=")[1].split("&")[0])
                    except Exception:
                        pass
                results.append({
                    "title": tag_clean.sub("", title),
                    "url": href,
                    "snippet": tag_clean.sub("", snippet)[:300]
                })
        except Exception as e:
            logger.debug(f"html fallback search failed: {e}")

    return web.json_response({
        "query": query,
        "results": results,
        "count": len(results),
        "searched_at": int(time.time())
    })


async def init_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_get("/models", handle_models)
    app.router.add_get("/api/models", handle_models)
    app.router.add_post("/search", handle_search)
    app.router.add_post("/api/search", handle_search)
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
