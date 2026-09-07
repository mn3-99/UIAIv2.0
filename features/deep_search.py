# features/deep_search.py
"""
محرك البحث الذكي (Agentic Deep Search) — Area 2
=====================================================
الخطوات:
  1) Adaptive Router: يقرّر هل يحتاج الاستعلام بحثاً عميقاً أم رداً مباشراً.
  2) Query Rewriting & Disambiguation: تفكيك القصد وحل تشابه الكلمات دلالياً
     (حمل الكيان الأخير من المحادثة لفك الإحالات مثل «تفاصيلها»).
  3) جمع 15-20 نتيجة من عدة صيغ بحث، ثم دمجها بـ Reciprocal Rank Fusion (RRF).
  4) Deep Scraping لأفضل 3-5 روابط وقراءة محتواها بعمق، ثم إعادة الترتيب.
يُرجع مراجع مرقّمة [1]..[N] مع خطوات تفكير (Reasoning Steps) لعرضها في الواجهة.
"""
import re
import time
import asyncio
import logging
import urllib.parse

logger = logging.getLogger("deep_search")


class DeepSearchEngine:
    # كلمات تشير إلى أسئلة تحتاج بحثاً حياً
    LIVE_HINTS = [
        "آخر", "أحدث", "حالياً", "الان", "2026", "2025", "2024", "السعر", "كم سعر",
        "اخبار", "حدث", "اليوم", "الآن", "سعر", "توقعات", "نتائج", "من هو", "ما هو",
        "من هي", "متى", "اين", "لماذا", "كيف", "what", "who", "when", "where", "latest",
        "price", "news", "today", "current", "how to", "best", "vs", "compared",
    ]
    # عبارات تحيّة/عابرة لا تحتاج بحثاً
    CASUAL = [
        "مرحبا", "أهلا", "السلام", "صباح", "مساء", "شكر", "تمام", "حلو", "ههه", "lol",
        "ok", "okay", "thanks", "hello", "hi", "hey", "سلام", "أوك", "تمام", "ممتاز",
    ]

    def adaptive_router(self, query: str, history) -> dict:
        q = query.strip().lower()
        if len(q) < 3:
            return {"needs_search": False, "reason": "استعلام قصير/تحية — لا حاجة للبحث."}
        if any(c in q for c in self.CASUAL) and len(q.split()) <= 4:
            return {"needs_search": False, "reason": "عبارة عابرة/تحية — رد مباشر."}
        # code/math only without live hints
        if re.search(r"^[0-9+\-*/()= .]+$", q) and not any(h in q for h in self.LIVE_HINTS):
            return {"needs_search": False, "reason": "عملية حسابية بحتة — رد مباشر."}
        if any(h in q for h in self.LIVE_HINTS):
            return {"needs_search": True, "reason": "الاستعلام يطلب معلومات حديثة/وقائعية — بحث حيّ مطلوب."}
        # أسئلة بـ «؟» أو ماذا/من/كيف عادة تحتاج سياقاً
        if "؟" in query or "?" in query or any(w in q for w in ["ماذا", "من", "كيف", "لماذا", "اين", "متى"]):
            return {"needs_search": True, "reason": "سؤال استفهامي يستفيد من مصادر ويب موثّقة."}
        return {"needs_search": True, "reason": "استعلام معرفي — البحث يحسّن الدقة والاستشهاد."}

    def rewrite_query(self, query: str, history) -> dict:
        variants = [query.strip()]
        notes = []
        # حمل الكيان الأخير من المحادثة لفك الإحالة (هذا/تلك/السابق/تها)
        last_entity = None
        if isinstance(history, list):
            for m in reversed(history[-5:]):
                txt = m.get("content") if isinstance(m, dict) else ""
                if isinstance(txt, str) and len(txt) > 3:
                    # أول عبارة مهمة/اسم معرّة
                    ent = re.findall(r"[\u0600-\u06FFA-Za-z]{4,}", txt)
                    ent = [w for w in ent if w.lower() not in ("التي", "وهو", "وهي", "وفي", "من")]
                    if ent:
                        last_entity = ent[0]
                        break
        anaphora = bool(re.search(r"\b(هذا|هذه|تلك|السابق|السابقة|تها|به|بها|عنه|عنها)\b", query))
        if anaphora and last_entity:
            expanded = f"{query.strip()} ({last_entity})"
            variants.append(expanded)
            notes.append(f"حُلّت الإحالة بربط الضمير بآخر كيان مذكور: «{last_entity}».")
        # صيغة إرشادية/مقارنة لتنويع النتائج
        guide = f"دليل شامل عن {query.strip()}"
        if guide not in variants:
            variants.append(guide)
        return {"variants": variants[:4], "notes": notes}

    async def _ddg(self, query: str, max_results: int = 10) -> list:
        results = []
        try:
            from ddgs import DDGS
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=max_results):
                    results.append({"title": r.get("title", ""), "url": r.get("href") or r.get("url", ""), "snippet": r.get("body", "")})
            if results:
                return results
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"ddgs failed: {e}")
        # HTML fallback
        try:
            import aiohttp
            headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"}
            timeout = aiohttp.ClientTimeout(total=15)
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.post("https://html.duckduckgo.com/html/", data={"q": query}) as resp:
                    html = await resp.text()
            items = re.findall(
                r'<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>',
                html, re.S)
            tag_clean = re.compile(r"<[^>]+>")
            for href, title, snippet in items[:max_results]:
                if href.startswith("//duckduckgo.com/l/?uddg="):
                    try:
                        href = urllib.parse.unquote(urllib.parse.urlparse("https:" + href).query.split("uddg=")[1].split("&")[0])
                    except Exception:
                        pass
                results.append({"title": tag_clean.sub("", title), "url": href, "snippet": tag_clean.sub("", snippet)[:400]})
        except Exception as e:
            logger.debug(f"html fallback failed: {e}")
        # Bing fallback (DuckDuckGo often blocks datacenter IPs)
        if not results:
            try:
                results = await self._bing(query, max_results)
            except Exception as e:
                logger.debug(f"bing fallback failed: {e}")
        return results

    @staticmethod
    def _bing_decode(href: str) -> str:
        if "bing.com/ck/a" not in href:
            return href
        m = re.search(r"[?&]u=a1([A-Za-z0-9_-]+)", href)
        if m:
            import base64
            b = m.group(1)
            try:
                b64 = b + "=" * ((4 - len(b) % 4) % 4)
                return base64.urlsafe_b64decode(b64).decode("utf-8", "ignore")
            except Exception:
                pass
        return href

    async def _bing(self, query: str, max_results: int = 10) -> list:
        try:
            import aiohttp
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                     "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                       "Accept-Language": "ar,en;q=0.8"}
            timeout = aiohttp.ClientTimeout(total=18)
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.get("https://www.bing.com/search",
                                       params={"q": query, "setlang": "ar", "count": str(max_results)}) as resp:
                    html = await resp.text()
            out = []
            items = re.findall(
                r'<li class="b_algo".*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>(.*?)</a></h2>(.*?)</li>',
                html, re.S)
            tag_clean = re.compile(r"<[^>]+>")
            for href, title, tail in items[:max_results]:
                t = tag_clean.sub(" ", title)
                snippet = ""
                pm = re.search(r"<p[^>]*>(.*?)</p>", tail, re.S)
                if pm:
                    snippet = tag_clean.sub(" ", pm.group(1))
                out.append({"title": re.sub(r"\s+", " ", t).strip(),
                            "url": self._bing_decode(href.strip()),
                            "snippet": re.sub(r"\s+", " ", snippet).strip()[:400]})
            return out
        except Exception as e:
            logger.debug(f"bing failed: {e}")
            return []

    async def _scrape(self, url: str) -> str:
        try:
            import aiohttp
            headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"}
            timeout = aiohttp.ClientTimeout(total=20)
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.get(url, ssl=False) as resp:
                    html = await resp.text()
            # استخلاص النص: إزالة السكربتات والستايل ثم الوسوم
            html = re.sub(r"<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
            # فقرات أهم من بقية العناصر
            paras = re.findall(r"<p[^>]*>(.*?)</p>", html, re.S | re.I)
            text = " ".join(paras) if paras else html
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:4000]
        except Exception as e:
            logger.debug(f"scrape failed {url}: {e}")
            return ""

    @staticmethod
    def _rrf(lists, k: int = 60) -> list:
        scores: dict = {}
        meta: dict = {}
        for lst in lists:
            for rank, item in enumerate(lst):
                url = item.get("url")
                if not url:
                    continue
                scores[url] = scores.get(url, 0.0) + 1.0 / (k + rank + 1)
                if url not in meta:
                    meta[url] = {"title": item.get("title", ""), "url": url, "snippet": item.get("snippet", "")}
                else:
                    # احتفظ بالوصف الأطول
                    if len(item.get("snippet", "")) > len(meta[url]["snippet"]):
                        meta[url]["snippet"] = item["snippet"]
                    if not meta[url]["title"]:
                        meta[url]["title"] = item.get("title", "")
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        return [meta[u] for u, _ in ranked]

    async def _wikipedia(self, query: str, max_results: int = 5) -> list:
        """Reliable Arabic-friendly fallback via Wikipedia API (keyless)."""
        try:
            import aiohttp
            lang = "ar" if re.search(r"[\u0600-\u06FF]", query) else "en"
            base = f"https://{lang}.wikipedia.org/w/api.php"
            headers = {"User-Agent": "MijlAI-Search/1.0 (research; contact: admin)"}
            timeout = aiohttp.ClientTimeout(total=14)
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.get(base, params={
                    "action": "query", "list": "search", "srsearch": query,
                    "format": "json", "utf8": "1", "srlimit": str(max_results),
                }) as resp:
                    data = await resp.json()
                pages = [(s.get("title", ""), s.get("snippet", "")) for s in data.get("query", {}).get("search", [])]
                if not pages:
                    return []
                titles = [t for t, _ in pages[:3]]
                extracts = {}
                if titles:
                    async with session.get(base, params={
                        "action": "query", "prop": "extracts", "explaintext": "1", "exintro": "1",
                        "titles": "|".join(titles), "format": "json", "utf8": "1", "exlimit": "max",
                    }) as resp2:
                        d2 = await resp2.json()
                    for pg in (d2.get("query", {}).get("pages", {}) or {}).values():
                        extracts[pg.get("title", "")] = (pg.get("extract") or "")
            out = []
            for title, snippet in pages:
                intro = extracts.get(title, "")
                text = re.sub(r"<[^>]+>", " ", (intro or snippet)).strip()
                text = re.sub(r"\s+", " ", text)
                out.append({
                    "title": title,
                    "url": f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                    "snippet": text[:500],
                    "content": text[:1400],
                })
            return out
        except Exception as e:
            logger.debug(f"wikipedia failed: {e}")
            return []

    async def run(self, query: str, history=None, top_n: int = 8) -> dict:
        steps = []
        router = self.adaptive_router(query, history)
        steps.append({"step": 1, "title": "الموجّه التكيّفي (Adaptive Router)",
                      "detail": router["reason"]})
        if not router["needs_search"]:
            return {
                "query": query,
                "needs_search": False,
                "reasoning_steps": steps,
                "rewritten_queries": [query],
                "results": [],
                "references": [],
                "count": 0,
                "searched_at": int(time.time()),
            }

        rw = self.rewrite_query(query, history)
        steps.append({"step": 2, "title": "تفكيك القصد وإعادة الصياغة (Query Rewriting)",
                      "detail": "صيغ البحث: " + " | ".join(rw["variants"]) + ((" — " + " ".join(rw["notes"])) if rw["notes"] else "")})

        is_arabic = bool(re.search(r"[\u0600-\u06FF]", query))

        # جمع النتائج: المحركات العامة فقط للاستعلامات غير العربية (Bing يعمل لها)،
        # لأنها تعيد نتائج مزيفة للعربية من هذا الخادم.
        raw_lists = []
        if not is_arabic:
            for v in rw["variants"]:
                res = await self._ddg(v, max_results=10)
                if res:
                    raw_lists.append(res)

        # ويكيبيديا مصدر موثوق (عربية أو إنكليزية) — إن كانت متاحة.
        wiki = await self._wikipedia(query, max_results=6)
        if wiki:
            raw_lists.insert(0, wiki)

        if is_arabic and not wiki:
            steps.append({"step": 3, "title": "جمع المصادر",
                          "detail": "محركات الويب تعيد نتائج غير موثوقة لهذه الصياغة من هذا الخادم، "
                                    "ولا تتوفر مصادر موثوقة — سأجيب مباشرةً من معرفتي."})
            return {
                "query": query,
                "needs_search": False,
                "reasoning_steps": steps,
                "rewritten_queries": rw["variants"],
                "results": [],
                "references": [],
                "count": 0,
                "searched_at": int(time.time()),
            }

        fused = self._rrf(raw_lists)[:20]
        steps.append({"step": 3, "title": "جمع ودمج النتائج (RRF)",
                      "detail": f"جُمعت {sum(len(l) for l in raw_lists)} نتيجة عبر {len(raw_lists)} صيغة بحث، ودُمجت بـ Reciprocal Rank Fusion إلى أفضل {len(fused)} نتيجة."})

        # Deep Scraping لأفضل 3-5 روابط
        top = fused[:5]
        scrape_tasks = [self._scrape(t["url"]) for t in top if t.get("url")]
        contents = await asyncio.gather(*scrape_tasks)
        read_count = 0
        for t, c in zip(top, contents):
            if c:
                t["content"] = c[:1400]
                read_count += 1
        if read_count:
            steps.append({"step": 4, "title": "قراءة عميقة (Deep Scraping)",
                          "detail": f"قُرئ محتوى {read_count} مصدر بالعمق وأُعيد ترتيبها حسب الصلة بالاستعلام."})
            # إعادة ترتيب بسيطة حسب تطابق الكلمات المفتاحية من الاستعلام
            qwords = set(re.findall(r"[\u0600-\u06FFA-Za-z]{3,}", query.lower()))
            def relevance(it):
                blob = (it.get("title", "") + " " + it.get("snippet", "") + " " + it.get("content", "")).lower()
                return sum(1 for w in qwords if w in blob)
            fused.sort(key=relevance, reverse=True)

        references = []
        for i, r in enumerate(fused[:top_n]):
            references.append({
                "num": i + 1,
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": (r.get("snippet") or "")[:350],
                "content": (r.get("content") or r.get("snippet") or "")[:1400],
            })
        return {
            "query": query,
            "needs_search": True,
            "reasoning_steps": steps,
            "rewritten_queries": rw["variants"],
            "results": fused[:20],
            "references": references,
            "count": len(fused),
            "searched_at": int(time.time()),
        }


deep_search_engine = DeepSearchEngine()
