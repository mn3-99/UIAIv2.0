# scrapers/duckduckgo_scraper.py
import asyncio
import json
import aiohttp
from typing import AsyncGenerator, Optional

class DuckDuckGoAIScraper:
    BASE_URL = "https://duckduckgo.com"

    async def get_vqd_token(self, session: aiohttp.ClientSession) -> str:
        async with session.get(
            f"{self.BASE_URL}/duckchat/v1/status",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "*/*",
                "Referer": "https://duckduckgo.com/"
            }
        ) as resp:
            if resp.status == 200:
                return resp.headers.get("x-vqd-4", "")
            raise Exception(f"Failed to get VQD token: {resp.status}")

    async def chat_stream(
        self,
        messages: list,
        model: str = "gpt-4o-mini",
        session: Optional[aiohttp.ClientSession] = None
    ) -> AsyncGenerator[str, None]:
        close_session = session is None
        session = session or aiohttp.ClientSession()

        try:
            vqd = await self.get_vqd_token(session)
            payload = {"model": model, "messages": messages}

            async with session.post(
                f"{self.BASE_URL}/duckchat/v1/chat",
                headers={
                    "Content-Type": "application/json",
                    "x-vqd-4": vqd,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Accept": "text/event-stream",
                    "Referer": "https://duckduckgo.com/"
                },
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
                            if "message" in obj:
                                yield obj["message"]
                        except Exception:
                            pass
        except Exception as e:
            yield f"DuckDuckGo Scraper Exception: {str(e)}"
        finally:
            if close_session:
                await session.close()
