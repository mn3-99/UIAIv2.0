import urllib.request
import urllib.error
import json
import asyncio
import logging
from typing import Dict, Any, List
from utils import get_smart_headers, jitter

logger = logging.getLogger("claude_scraper")

class ClaudeScraperEngine:
    CLAUDE_MODELS = [
        {"id": "claude-3.5-sonnet", "name": "Claude 3.5 Sonnet (Verified)"},
        {"id": "claude-3.7-sonnet", "name": "Claude 3.7 Sonnet (Verified)"},
        {"id": "claude-3.5-haiku", "name": "Claude 3.5 Haiku (Verified)"},
        {"id": "claude-3-opus", "name": "Claude 3 Opus (Verified)"}
    ]

    async def verify_claude_model(self, model_info: Dict[str, Any], api_key: str = "") -> Dict[str, Any]:
        await asyncio.sleep(jitter(0.2, 0.5))
        
        # Try direct or fallback verification
        if api_key:
            try:
                text = await self._test_direct_anthropic(model_info["id"], api_key)
                if text:
                    return {
                        "model_id": f"g4f:{model_info['id']}",
                        "name": model_info["name"],
                        "method_used": "Anthropic_Direct_API",
                        "status": "SUCCESS"
                    }
            except Exception as e:
                logger.debug(f"[Claude Direct Scrape Error] {model_info['id']}: {e}")

        # Fallback to Live Ping Test verification via free providers
        return await self._verify_claude_fallback(model_info)

    async def _test_direct_anthropic(self, model_id: str, api_key: str) -> str:
        def _make_req():
            headers = get_smart_headers("https://claude.ai")
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = "2023-06-01"

            payload = json.dumps({
                "model": model_id,
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "say ok"}]
            }).encode("utf-8")

            req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    if "content" in data and len(data["content"]) > 0:
                        return data["content"][0].get("text", "")
            return ""

        return await asyncio.to_thread(_make_req)

    async def _verify_claude_fallback(self, model_info: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from g4f.client import AsyncClient
            client = AsyncClient()
            
            res_coro = client.chat.completions.create(
                model=model_info["id"],
                messages=[{"role": "user", "content": "hi"}],
                stream=True
            )

            if asyncio.iscoroutine(res_coro):
                res_stream = await asyncio.wait_for(res_coro, timeout=8.0)
            else:
                res_stream = res_coro

            token_received = False
            try:
                async for chunk in res_stream:
                    content = ""
                    if hasattr(chunk, "choices") and chunk.choices:
                        content = chunk.choices[0].delta.content or ""
                    elif isinstance(chunk, str):
                        content = chunk
                    if content and len(content.strip()) > 0:
                        token_received = True
                        break
            finally:
                if hasattr(res_stream, "aclose") and callable(res_stream.aclose):
                    try:
                        await res_stream.aclose()
                    except Exception:
                        pass

            if token_received:
                logger.info(f"✅ Claude Model Verified Live: {model_info['id']}")
                return {
                    "model_id": f"g4f:{model_info['id']}",
                    "name": model_info["name"],
                    "method_used": "g4f_live_ping",
                    "status": "SUCCESS"
                }
        except Exception as e:
            logger.debug(f"[Claude Live Verification Failed] {model_info['id']}: {e}")

        return {"model_id": f"g4f:{model_info['id']}", "status": "FAILED"}
