# providers/openrouter_free.py
import aiohttp
import json
import os
from typing import AsyncGenerator, List, Dict, Any

class OpenRouterFreeProvider:
    BASE_URL = "https://openrouter.ai/api/v1"
    
    FREE_MODELS = [
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3.5-lightning:free",
        "minimax/minimax-m3:free",
        "minimax/minimax-m2.7:free",
        "liquid/lfm-2.5-2.6b:free",
        "poolside/laguna-s-2.1:free",
        "poolside/laguna-xs-2.1:free",
        "z-ai/glm-5.2:free",
        "inclusionai/ling-3.0-flash-fin:free",
    ]

    async def get_free_models(self, api_key: str = None) -> List[Dict[str, Any]]:
        key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not key:
            return []
        headers = {"Authorization": f"Bearer {key}"}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.BASE_URL}/models", headers=headers) as resp:
                    data = await resp.json()
                    models = data.get("data", [])
                    return [m for m in models if ":free" in m.get("id", "")]
            except Exception:
                return []

    async def chat_stream(
        self,
        messages: list,
        model: str = "google/gemma-4-31b-it:free",
        api_key: str = None
    ) -> AsyncGenerator[str, None]:
        key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not key:
            yield "OpenRouter API key required in environment OPENROUTER_API_KEY"
            return
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mijlai.duckdns.org",
            "X-Title": "MijlAI"
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4096,
            "stream": True
        }
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload
                ) as resp:
                    async for line in resp.content:
                        line_str = line.decode("utf-8").strip()
                        if line_str.startswith("data: "):
                            data = line_str[6:]
                            if data == "[DONE]":
                                break
                            try:
                                obj = json.loads(data)
                                delta = obj["choices"][0]["delta"].get("content", "")
                                if delta:
                                    yield delta
                            except Exception:
                                pass
            except Exception as e:
                yield f"OpenRouter Provider Error: {str(e)}"
