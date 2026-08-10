# scrapers/you_scraper.py
import aiohttp
import json
from typing import AsyncGenerator

class YouScraper:
    API_URL = "https://you.com/api/streamingSearch"

    async def chat_stream(self, query: str, chat_id: str = None) -> AsyncGenerator[str, None]:
        params = {
            "q": query,
            "page": 1,
            "count": 10,
            "safeSearch": "Moderate",
            "mkt": "",
            "responseFilter": "WebPages,Translations,TimeZone,Computation,RelatedSearches",
            "domain": "youchat",
            "chat": json.dumps([{"role": "user", "content": query}])
        }
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    self.API_URL,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                        "Accept": "text/event-stream",
                        "Referer": "https://you.com/"
                    },
                    params=params
                ) as resp:
                    async for line in resp.content:
                        line_str = line.decode("utf-8").strip()
                        if line_str.startswith("data: "):
                            try:
                                data = json.loads(line_str[6:])
                                if "youChatToken" in data:
                                    yield data["youChatToken"]
                            except Exception:
                                pass
            except Exception as e:
                yield f"You.com Scraper Exception: {str(e)}"
