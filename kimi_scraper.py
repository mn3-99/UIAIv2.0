import urllib.request
import urllib.error
import json
import asyncio
import logging
from typing import Dict, Any, Optional
from utils import get_smart_headers, jitter

logger = logging.getLogger("kimi_scraper")

class KimiK3ScraperEngine:
    """
    محرك خاص بالبحث وكشط وتجربة Kimi K3 من طرق ومنصات متعددة حياً
    """
    
    TARGET_ENDPOINTS = [
        {
            "name": "Kimi_K3_Custom_Provider",
            "provider_type": "g4f_custom",
            "model_tag": "kimi-k3",
            "display_name": "Kimi K3 (Verified)"
        },
        {
            "name": "Kimi_Chat_Provider",
            "provider_type": "g4f_custom",
            "model_tag": "kimi",
            "display_name": "Kimi Chat (Verified)"
        },
        {
            "name": "Moonshot_Direct_K3",
            "url": "https://api.moonshot.cn/v1/chat/completions",
            "model_tag": "kimi-k3",
            "origin": "https://www.moonshot.cn",
            "display_name": "Moonshot K3 (Verified)"
        },
        {
            "name": "Kimi_Web_Simulated",
            "url": "https://kimi.moonshot.cn/api/chat",
            "model_tag": "k3-preview",
            "origin": "https://kimi.moonshot.cn",
            "display_name": "Kimi Web K3 (Verified)"
        }
    ]

    async def try_scrape_and_verify_kimi_k3(self) -> Dict[str, Any]:
        """تجربة كل الطرق الممكنة حتى الوصول لطريقة تعمل مضمونة 100%"""
        for target in self.TARGET_ENDPOINTS:
            await asyncio.sleep(jitter(0.2, 0.5))
            try:
                if target.get("provider_type") == "g4f_custom":
                    res = await self._test_g4f_kimi(target["model_tag"])
                else:
                    res = await self._test_direct_http(target)
                
                if res and len(str(res).strip()) > 0:
                    logger.info(f"✓ Kimi K3 Scraped & Verified via method: {target['name']}")
                    return {
                        "model_id": f"g4f:{target['model_tag']}",
                        "display_name": target["display_name"],
                        "method_used": target["name"],
                        "status": "SUCCESS",
                        "sample_response": str(res)[:50]
                    }
            except Exception as e:
                logger.debug(f"[Kimi K3 Scrape Attempt Failed] Endpoint: {target['name']} | Error: {e}")
                continue

        logger.info("ℹ️ Kimi K3 live verification completed (no active endpoints).")
        return {"model_id": "g4f:kimi-k3", "status": "FAILED"}

    async def _test_direct_http(self, target_info: Dict[str, Any]) -> str:
        def _make_req():
            headers = get_smart_headers(target_info.get("origin"))
            payload = json.dumps({
                "model": target_info["model_tag"],
                "messages": [{"role": "user", "content": "hi"}],
                "temperature": 0.3,
                "stream": False
            }).encode("utf-8")
            
            req = urllib.request.Request(target_info["url"], data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    if "choices" in data and len(data["choices"]) > 0:
                        return data["choices"][0].get("message", {}).get("content", "")
                    elif "content" in data:
                        return data.get("content", "")
            return ""

        return await asyncio.to_thread(_make_req)

    async def _test_g4f_kimi(self, model_tag: str) -> str:
        from g4f.client import AsyncClient
        client = AsyncClient()
        start_time = asyncio.get_event_loop().time()
        
        res_coro = client.chat.completions.create(
            model=model_tag,
            messages=[{"role": "user", "content": "hi"}],
            stream=True
        )

        if asyncio.iscoroutine(res_coro):
            res_stream = await asyncio.wait_for(res_coro, timeout=8.0)
        else:
            res_stream = res_coro

        token_got = ""
        try:
            async for chunk in res_stream:
                content = ""
                if hasattr(chunk, "choices") and chunk.choices:
                    content = chunk.choices[0].delta.content or ""
                elif isinstance(chunk, str):
                    content = chunk
                if content and len(content.strip()) > 0:
                    token_got = content
                    break
        finally:
            if hasattr(res_stream, "aclose") and callable(res_stream.aclose):
                try:
                    await res_stream.aclose()
                except Exception:
                    pass

        return token_got
