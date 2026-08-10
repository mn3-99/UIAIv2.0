# providers/together_free.py
import aiohttp
import json
import os
from typing import AsyncGenerator

class TogetherFreeProvider:
    BASE_URL = "https://api.together.xyz/v1"

    async def chat_stream(
        self,
        messages: list,
        model: str = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        api_key: str = None
    ) -> AsyncGenerator[str, None]:
        key = api_key or os.environ.get("TOGETHER_API_KEY", "")
        if not key:
            yield "Together AI key required in TOGETHER_API_KEY"
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
                yield f"Together Provider Error: {str(e)}"
