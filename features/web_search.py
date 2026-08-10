# features/web_search.py
import aiohttp
import json
import re
from typing import List, Dict

class WebSearchEngine:
    async def duckduckgo_search(self, query: str, max_results: int = 5) -> List[Dict]:
        url = "https://html.duckduckgo.com/html/"
        data = {"q": query, "kl": "ar-ar"}
        results = []
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=data, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    html = await resp.text()
                    # Clean extraction using regex for lightweight operation
                    snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.DOTALL)
                    titles = re.findall(r'<a class="result__url[^>]*>(.*?)</a>', html, re.DOTALL)
                    for i in range(min(len(snippets), max_results)):
                        clean_snippet = re.sub(r'<[^>]+>', '', snippets[i]).strip()
                        clean_title = re.sub(r'<[^>]+>', '', titles[i]).strip() if i < len(titles) else f"Search Result {i+1}"
                        results.append({
                            "title": clean_title,
                            "snippet": clean_snippet,
                            "url": f"https://duckduckgo.com/?q={query}"
                        })
        except Exception as e:
            results.append({"title": "Search Error", "snippet": str(e), "url": ""})
        return results

    async def enhance_prompt_with_search(self, query: str, messages: list) -> list:
        results = await self.duckduckgo_search(query)
        if not results:
            return messages
        search_context = "\n".join([
            f"[{i+1}] {r['title']}: {r['snippet']}"
            for i, r in enumerate(results)
        ])
        enhanced = messages.copy()
        enhanced.append({
            "role": "system",
            "content": f"نتائج البحث الحية لخدمة MijlAI:\n{search_context}\n\nأجب باللغة العربية واعتمد على هذه نتائج البحث المحدثة."
        })
        return enhanced

web_search_engine = WebSearchEngine()
