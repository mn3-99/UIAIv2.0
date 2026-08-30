# providers/meta_ai_free.py
import aiohttp
import json
import os
from typing import AsyncGenerator

class MetaAIFreeProvider:
    BASE_URL = "https://api.meta.ai/v1"

    async def chat_stream(
        self,
        messages: list,
        model: str = "muse-spark-1.2",
        api_key: str = None
    ) -> AsyncGenerator[str, None]:
        key = api_key or os.environ.get("META_AI_API_KEY", "")
        if not key:
            yield "Meta AI API key required in environment META_AI_API_KEY"
            return
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
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
                yield f"Meta AI Provider Error: {str(e)}"
