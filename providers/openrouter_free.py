# providers/openrouter_free.py
import aiohttp
import json
from typing import AsyncGenerator

class OpenRouterFreeProvider:
    BASE_URL = "https://openrouter.ai/api/v1"

    async def chat_stream(
        self,
        messages: list,
        model: str = "meta-llama/llama-3.1-8b-instruct:free",
        api_key: str = None
    ) -> AsyncGenerator[str, None]:
        headers = {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mijlai.com",
            "X-Title": "MijlAI"
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload = {"model": model, "messages": messages, "stream": True}
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
