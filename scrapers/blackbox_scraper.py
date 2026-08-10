# scrapers/blackbox_scraper.py
import aiohttp
import json
from typing import AsyncGenerator

class BlackboxScraper:
    API_URL = "https://www.blackbox.ai/api/chat"

    async def chat_stream(self, messages: list, model: str = "gpt-4o") -> AsyncGenerator[str, None]:
        payload = {
            "messages": messages,
            "id": "chat-free",
            "previewToken": None,
            "userId": None,
            "codeModelMode": True,
            "agentMode": {},
            "trendingAgentMode": {},
            "isMicMode": False,
            "isChromeExt": False,
            "githubToken": None,
            "clickedAnswer2": False,
            "clickedAnswer3": False,
            "clickedForceWebSearch": False,
            "visitFromDelta": False,
            "mobileClient": False,
            "userSelectedModel": model
        }
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    self.API_URL,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                        "Accept": "text/event-stream",
                        "Referer": "https://www.blackbox.ai/"
                    },
                    json=payload
                ) as resp:
                    async for line in resp.content:
                        line_str = line.decode("utf-8").strip()
                        if "$@$v=v1.13-rv1$" in line_str:
                            text = line_str.split("$@$v=v1.13-rv1$")[-1]
                            if text:
                                yield text
                        elif line_str:
                            yield line_str
            except Exception as e:
                yield f"Blackbox Scraper Exception: {str(e)}"
