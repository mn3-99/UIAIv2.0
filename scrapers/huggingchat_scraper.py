# scrapers/huggingchat_scraper.py
import aiohttp
import json
from typing import AsyncGenerator

class HuggingChatScraper:
    BASE_URL = "https://huggingface.co"
    CHAT_URL = "https://huggingface.co/chat"

    async def get_conversation_id(self, session: aiohttp.ClientSession) -> str:
        async with session.post(
            f"{self.BASE_URL}/chat/conversation",
            headers={"Content-Type": "application/json", "Referer": self.CHAT_URL},
            json={"model": "meta-llama/Meta-Llama-3.1-70B-Instruct"}
        ) as resp:
            data = await resp.json()
            return data.get("conversationId", "")

    async def chat_stream(self, messages: list, model: str = "meta-llama/Meta-Llama-3.1-70B-Instruct") -> AsyncGenerator[str, None]:
        async with aiohttp.ClientSession() as session:
            try:
                conv_id = await self.get_conversation_id(session)
                payload = {
                    "inputs": messages[-1]["content"] if messages else "",
                    "parameters": {"temperature": 0.7, "max_new_tokens": 2048, "return_full_text": False},
                    "stream": True
                }
                async with session.post(
                    f"{self.BASE_URL}/chat/conversation/{conv_id}",
                    headers={"Content-Type": "application/json", "Referer": self.CHAT_URL},
                    json=payload
                ) as resp:
                    async for line in resp.content:
                        line_str = line.decode("utf-8").strip()
                        if line_str.startswith("data:"):
                            try:
                                data = json.loads(line_str[5:].strip())
                                if "token" in data:
                                    yield data["token"]["text"]
                            except Exception:
                                pass
            except Exception as e:
                yield f"HuggingChat Scraper Exception: {str(e)}"
