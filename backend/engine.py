import asyncio
import os
import time
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    aioredis = None
    REDIS_AVAILABLE = False
    print("ℹ️ Redis module not installed. Defaulting to in-memory task store.")

logger = logging.getLogger("engine")
logging.basicConfig(level=logging.INFO)


async def _idle_reader(stream, idle_seconds: float = 55.0):
    """Yield upstream SSE chunks, but end (return) if NO chunk arrives for
    `idle_seconds`. Used by the model chain: a channel that queues/hangs with
    zero tokens for ~55s is abandoned so the next fallback model answers fast
    instead of making the user wait minutes."""
    it = stream.__aiter__()
    while True:
        try:
            yield await asyncio.wait_for(it.__anext__(), timeout=idle_seconds)
        except StopAsyncIteration:
            return
        except asyncio.TimeoutError:
            logger.warning(f"[engine] no upstream chunk for {idle_seconds:.0f}s — abandoning this channel")
            return
        except Exception:
            return


# ---------------------------------------------------------------------------
# MijlAi Answer-Methodology Layer (enforced for EVERY model / EVERY request).
# Distilled from the owner's "high-tuning" spec: multi-level intent modelling,
# tool-need decision, iterative research w/ saturation stop, uncertainty
# calibration, cross-source fact-checking, adaptive structure, executed
# step-by-step writing, post-generation checks + type-dependent applicability.
# Grounded in verification-first techniques (chain-of-verification style).
# It never weakens the identity core: priority = MijlAi identity/safety first,
# then this protocol, then user style overrides.
# ---------------------------------------------------------------------------
METHODOLOGY_SYSTEM_PROMPT = (
    "منهجية الإجابة الإلزامية (وكيل بحث وتنفيذ عميق) — تُطبَّق على كل موديل وكل رسالة:\n"
    "أنت وكيل بحث وتنفيذ عميق متخصص في تحليل المشكلات وإنجاز المهام بأعلى دقة. "
    "تتصرف وفق منهجية صارمة تعتمد على التفكير المنظم والشفافية، ودون تعارض مع هويتك (MijlAi) وقواعدها.\n\n"
    "المبادئ الأساسية:\n"
    "1. لا تعتمد على معرفتك الداخلية فقط في المسائل التي تتطلب بيانات حديثة أو دقيقة أو قابلة للتحقق — "
    "استخدم أدوات البحث/الاسترجاع المتاحة في بيئتك، وإن لم تتوفر فاعتمد على معرفتك مع وسم واضح لكل ما قد يكون تغيّر.\n"
    "2. التزم بالهيكل التالي قبل تقديم أي إجابة نهائية.\n\n"
    "هيكل الإجابة الإلزامي (اعرضه بعناوين واضحة وبنفس لغة المستخدم):\n"
    "1. تحليل الطلب: الهدف الأساسي للمستخدم، طبيعة الاستعلام (بحث خارجي / تحليل منطقي / تنفيذ عملي / غيره)، والقيود والشروط الخاصة.\n"
    "2. خطة العمل: خطة مرقمة من 3 إلى 5 خطوات واضحة ومحددة.\n"
    "3. تنفيذ الخطة: نفّذ كل خطوة واعرضها بالشكل: الخطوة [X]: [اسم الخطوة] / الإجراء والأداة / النتيجة والملاحظات.\n"
    "4. التحقق والتقييم: لخّص النقاط المفصلية، وقيّم موثوقية المصادر ومدى الثقة في النتيجة.\n"
    "5. الإجابة النهائية: إجابة شاملة مرتبة مباشرة تفي بطلب المستخدم تماماً.\n\n"
    "القواعد:\n"
    "- كن شفافاً واعرض خطوات التفكير بوضوح.\n"
    "- التزم بلغة المستخدم نفسها.\n"
    "- إذا كان هناك نقص في المعطيات يمنع إجابة دقيقة، اطلب التوضيح بعد مرحلة التحليل.\n"
    "- للأسئلة البسيطة (تحية، رد بكلمة) اختصر الهيكل إلى الحد الأدنى دون إخلال بالوضوح.\n"
    "- ممنوع اختلاق مصادر أو أرقام أو مراجع؛ ما لا يمكن التحقق منه يُوسَم بثقة منخفضة.\n\n"
    "ترتيب الأولوية عند أي تعارض: هوية MijlAi وقواعدها وسلامة المستخدم أولاً، ثم هذه المنهجية، ثم تعليمات الأسلوب الإضافية من المستخدم."
)

# ---------------------------------------------------------------------------
# Freshness-triggered web augmentation: when the prompt demands current data,
# fetch live results from the local keyless search tool (:5050/search) and
# inject them as context so the methodology's "research tools" step uses REAL
# tools instead of relying on model memory. Quality-gated: irrelevant results
# are discarded rather than injected.
# ---------------------------------------------------------------------------
_FRESH_HINTS = (
    "اليوم", "الآن", "حاليا", "الحالي", "الحالية", "آخر", "أحدث", "أخبار",
    "خبر", "سعر", "أسعار", "الطقس", "النتيجة", "من فاز", "جديد",
    "today", "now", "current", "latest", "recent", "news",
    "price", "weather", "who won", "score", "2026", "2025",
)


async def _fetch_search_context(prompt: str) -> str:
    text = (prompt or "").strip()
    if len(text) < 12:
        return ""
    low = text.lower()
    if not any(h in text or h in low for h in _FRESH_HINTS):
        return ""
    try:
        import aiohttp as _aio
        timeout = _aio.ClientTimeout(total=25, connect=8)
        async with _aio.ClientSession(timeout=timeout) as sess:
            async with sess.post(
                "http://127.0.0.1:5050/search",
                json={"query": text[:500], "max_results": 5},
            ) as resp:
                if resp.status != 200:
                    return ""
                data = await resp.json()
        results = data.get("results") or []
        if not results:
            return ""
        # Quality gate: at least one query keyword must appear in the results.
        keywords = [w for w in low.split() if len(w) > 3][:8]
        blob = " ".join(
            f"{r.get('title', '')} {r.get('snippet', '')}" for r in results
        ).lower()
        if keywords and not any(k in blob for k in keywords):
            return ""
        lines = []
        for i, r in enumerate(results[:5], 1):
            title = (r.get("title") or "").strip()
            snip = (r.get("snippet") or "").strip()[:280]
            url = (r.get("url") or "").strip()
            lines.append(f"{i}. {title} — {snip} ({url})")
        return (
            "[نتائج بحث ويب حيّة — استخدمها لتأسيس إجابتك عن الجزء المحدّث من السؤال "
            "واذكر أنها معلومات محدثة من البحث]:\n" + "\n".join(lines)
        )
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Session tools — defined WITH the models, auto-linked in EVERY session.
# The methodology requires research/execution; these are the real tools:
#   web_search     : live web (auto on freshness-demanding prompts)
#   python_exec    : sandboxed python (auto on explicit exec request + fence)
#   workspace files: !read <path> / !files [dir] for code/file study
# Manifest is injected as a system message every request (after methodology).
# ---------------------------------------------------------------------------
TOOLS_MANIFEST = (
    "[أدوات الجلسة — مربوطة تلقائيًا مع كل موديل في كل جلسة]:\n"
    "1. web_search: بحث ويب حي — يعمل تلقائيًا عندما يطلب السؤال بيانات حديثة، وتُرفق نتائجه في سياق منفصل.\n"
    "2. python_exec: تنفيذ كود بايثون في ساندبوكس معزول (nobody + حدود موارد + 15 ثانية) — يعمل تلقائيًا عندما يطلب المستخدم التنفيذ صراحة مع كتلة ```python (للمستخدمين المسجلين)، وتُرفق المخرجات في سياق منفصل.\n"
    "3. workspace_files: قراءة ملفات مساحة العمل لدراسة الأكواد والمرفقات — تُرفق تلقائيًا عند كتابة !read <المسار> أو !files [مجلد] في الرسالة.\n"
    "عند وجود سياق أداة مرفق اعتمد مخرجاته حرفيًا في إجابتك واذكر أن النظام نفّذ الأداة."
)

_EXEC_HINTS = ("نفذ", "نفّذ", "شغل", "شغّل", "نفذ الكود", "شغل الكود",
               "execute", "run the code", "run this code")

_WORKSPACES_ROOT = "/home/lalo/UIAIv2.0/workspaces"


def _safe_workspace(chat_id: str) -> str:
    import re
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", chat_id or "default")[:64] or "default"
    return "/home/lalo/UIAIv2.0/workspaces/" + safe


def _extract_python_fence(text: str) -> str:
    import re
    m = re.search(r"```python\s*\n(.*?)```", text or "", re.S)
    return (m.group(1) if m else "").strip()[:20000]


def _run_sandboxed(code: str, workdir: str) -> str:
    """Run python as nobody+prlimit (mirrors /api/python/run limits)."""
    import subprocess
    os.makedirs(workdir, exist_ok=True)
    # nobody must traverse + write here (mirror /api/python/run semantics)
    for _p in (workdir,):
        try:
            os.chmod(_p, 0o777)
        except Exception:
            pass
    cell = os.path.join(workdir, f"cell_{int(time.time() * 1000)}.py")
    with open(cell, "w", encoding="utf-8") as fh:
        fh.write(code)
    try:
        os.chmod(cell, 0o644)
    except Exception:
        pass
    try:
        p = subprocess.run(
            ["sudo", "-n", "-u", "nobody", "prlimit", "--cpu=10",
             "--as=536870912", "--nproc=32", "--fsize=5242880", "--nofile=64",
             "/usr/bin/python3", "-u", cell],
            cwd=workdir, capture_output=True, text=True, timeout=15,
            env={"PATH": "/usr/bin:/bin", "HOME": workdir,
                 "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1"})
        out = (p.stdout or "")[-4000:]
        err = (p.stderr or "")[-2000:]
        return (f"[مخرجات تنفيذ الكود — exit={p.returncode}]:\n{out}"
                + (f"\n[أخطاء]:\n{err}" if err.strip() else ""))
    except subprocess.TimeoutExpired:
        return "[مخرجات تنفيذ الكود]: انتهت المهلة (15 ثانية) — أُوقف التنفيذ."
    except Exception as e:
        return f"[مخرجات تنفيذ الكود]: تعذر التنفيذ ({e})."


def _read_workspace_files(prompt: str, workdir: str) -> str:
    """Handle !read <path> / !files [dir] markers inside the session workspace."""
    import re
    blocks = []
    for m in re.finditer(r"!read\s+([^\s\n]+)", prompt or ""):
        rel = m.group(1).strip()
        target = os.path.normpath(os.path.join(workdir, rel))
        if not target.startswith(os.path.normpath(workdir) + os.sep):
            blocks.append(f"[!read {rel}]: مسار مرفوض (خارج مساحة العمل).")
            continue
        try:
            if not os.path.isfile(target):
                blocks.append(f"[!read {rel}]: الملف غير موجود في مساحة العمل.")
                continue
            if os.path.getsize(target) > 51200:
                blocks.append(f"[!read {rel}]: الملف كبير (>50KB) — رُفض.")
                continue
            with open(target, encoding="utf-8", errors="replace") as fh:
                content = fh.read()
            blocks.append(f"[محتوى الملف {rel}]:\n{content}")
        except Exception as e:
            blocks.append(f"[!read {rel}]: تعذر القراءة ({e}).")
    for m in re.finditer(r"!files(?:\s+([^\s\n]+))?", prompt or ""):
        rel = (m.group(1) or "").strip()
        target = os.path.normpath(os.path.join(workdir, rel)) if rel else workdir
        if not target.startswith(os.path.normpath(workdir) + os.sep) and target != os.path.normpath(workdir):
            blocks.append("[!files]: مسار مرفوض.")
            continue
        try:
            names = sorted(os.listdir(target))[:100]
            blocks.append(f"[ملفات {rel or '/'}]: " + (", ".join(names) if names else "(فارغ)"))
        except Exception as e:
            blocks.append(f"[!files]: تعذر السرد ({e}).")
    return "\n".join(blocks)


class TaskStore:

    """
    Dual-layer persistent storage manager using Redis with in-memory fallback.
    Saves LLM response chunks and offsets for zero-latency resumption.
    """
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis_client = None
        self._memory_store: Dict[str, Dict[str, Any]] = {}

    async def initialize(self) -> None:
        try:
            client = aioredis.from_url(self.redis_url, decode_responses=True)
            await client.ping()
            self.redis_client = client
            logger.info("✅ Redis connected successfully for task checkpointing.")
        except Exception as e:
            logger.info(f"ℹ️ Redis unavailable ({e}). Using high-performance in-memory task store.")
            self.redis_client = None

    async def create_task(self, task_id: str, prompt: str) -> Dict[str, Any]:
        task_data = {
            "task_id": task_id,
            "prompt": prompt,
            "status": "generating",
            "full_text": "",
            "tokens": [],
            "think_tokens": [],
            "think_text": "",
            "created_at": time.time(),
            "updated_at": time.time(),
            "error": None
        }
        if self.redis_client:
            try:
                await self.redis_client.hset(
                    f"task:{task_id}",
                    mapping={
                        "task_id": task_id,
                        "prompt": prompt,
                        "status": "generating",
                        "full_text": "",
                        "created_at": str(task_data["created_at"]),
                        "updated_at": str(task_data["updated_at"])
                    }
                )
                await self.redis_client.expire(f"task:{task_id}", 86400) # 24h TTL
            except Exception as e:
                logger.warning(f"Redis write error on create_task: {e}")

        self._memory_store[task_id] = task_data
        return task_data

    async def update_checkpoint(self, task_id: str, new_text: str, token_offset: int, status: str = "generating") -> None:
        if task_id in self._memory_store:
            task = self._memory_store[task_id]
            task["full_text"] += new_text
            task["tokens"].append({"o": token_offset, "d": new_text})
            task["status"] = status
            task["updated_at"] = time.time()

        if self.redis_client:
            try:
                pipe = self.redis_client.pipeline()
                pipe.hset(f"task:{task_id}", "full_text", self._memory_store[task_id]["full_text"] if task_id in self._memory_store else "")
                pipe.hset(f"task:{task_id}", "status", status)
                pipe.hset(f"task:{task_id}", "updated_at", str(time.time()))
                pipe.rpush(f"task:{task_id}:tokens", json.dumps({"o": token_offset, "d": new_text}))
                pipe.expire(f"task:{task_id}", 86400)
                pipe.expire(f"task:{task_id}:tokens", 86400)
                await pipe.execute()
            except Exception as e:
                logger.warning(f"Redis checkpoint error: {e}")

    async def set_completed(self, task_id: str, error: Optional[str] = None) -> None:
        status = "failed" if error else "completed"
        if task_id in self._memory_store:
            self._memory_store[task_id]["status"] = status
            self._memory_store[task_id]["error"] = error
            self._memory_store[task_id]["updated_at"] = time.time()

        if self.redis_client:
            try:
                mapping = {"status": status, "updated_at": str(time.time())}
                if error:
                    mapping["error"] = error
                await self.redis_client.hset(f"task:{task_id}", mapping=mapping)
            except Exception as e:
                logger.warning(f"Redis set_completed error: {e}")

    async def set_aborted(self, task_id: str) -> None:
        """Mark a task as aborted by the user (distinct terminal state)."""
        if task_id in self._memory_store:
            self._memory_store[task_id]["status"] = "aborted"
            self._memory_store[task_id]["updated_at"] = time.time()
        if self.redis_client:
            try:
                await self.redis_client.hset(f"task:{task_id}", mapping={"status": "aborted", "updated_at": str(time.time())})
            except Exception as e:
                logger.warning(f"Redis set_aborted error: {e}")

    async def add_think_token(self, task_id: str, text: str) -> None:
        """Buffer a reasoning (think) token for live SSE fan-out."""
        if not text or task_id not in self._memory_store:
            return
        task = self._memory_store[task_id]
        task.setdefault("think_tokens", []).append(text)
        task["think_text"] = task.get("think_text", "") + text
        task["updated_at"] = time.time()

    async def get_think_text(self, task_id: str) -> str:
        if task_id in self._memory_store:
            return self._memory_store[task_id].get("think_text", "")
        return ""

    async def get_task_preview(self, task_id: str) -> Dict[str, Any]:
        """Lightweight check for instant load (predictive pre-fetching)"""
        if task_id in self._memory_store:
            task = self._memory_store[task_id]
            tokens = task.get("tokens", [])
            last_chunk = tokens[-1]["d"] if tokens else ""
            return {
                "task_id": task_id,
                "status": task["status"],
                "full_text": task["full_text"],
                "token_count": len(tokens),
                "last_chunk": last_chunk,
                "thinking": task.get("think_text", ""),
                "error": task.get("error")
            }

        if self.redis_client:
            try:
                data = await self.redis_client.hgetall(f"task:{task_id}")
                if data:
                    token_count = await self.redis_client.llen(f"task:{task_id}:tokens")
                    last_token_str = await self.redis_client.lindex(f"task:{task_id}:tokens", -1)
                    last_chunk = json.loads(last_token_str)["d"] if last_token_str else ""
                    return {
                        "task_id": task_id,
                        "status": data.get("status", "not_found"),
                        "full_text": data.get("full_text", ""),
                        "token_count": token_count,
                        "last_chunk": last_chunk,
                        "error": data.get("error")
                    }
            except Exception as e:
                logger.warning(f"Redis preview fetch error: {e}")

        return {"task_id": task_id, "status": "not_found", "full_text": "", "token_count": 0, "last_chunk": "", "error": None}

    async def get_tokens_from_offset(self, task_id: str, offset: int = 0) -> List[Dict[str, Any]]:
        if task_id in self._memory_store:
            tokens = self._memory_store[task_id].get("tokens", [])
            return tokens[offset:]

        if self.redis_client:
            try:
                raw_tokens = await self.redis_client.lrange(f"task:{task_id}:tokens", offset, -1)
                return [json.loads(t) for t in raw_tokens]
            except Exception as e:
                logger.warning(f"Redis tokens fetch error: {e}")

        return []

# Singleton task store instance
task_store = TaskStore()

import re as _re

_CODE_SEGMENT_RE = _re.compile(r"(```[\s\S]*?```|`[^`\n]*`)")

def sanitize_identity_outside_code(text: str) -> str:
    """Apply MijlAi identity replacements to prose only — fenced/inline code is
    left untouched so snippets legitimately mentioning Microsoft never break."""
    if not text:
        return text

    def _clean(segment: str) -> str:
        return (
            segment
            .replace("Microsoft Copilot", "مساعد MijlAi الذكي")
            .replace("Copilot", "مساعد MijlAi الذكي")
            .replace("كوبايلوت", "مساعد MijlAi الذكي")
            .replace("كوبايلت", "مساعد MijlAi الذكي")
            .replace("شركة Microsoft", "محمود نمر العجلة (Mhmod Nemr Alijla)")
            .replace("شركة مايكروسوفت", "محمود نمر العجلة (Mhmod Nemr Alijla)")
            .replace("مايكروسوفت", "محمود نمر العجلة (Mhmod Nemr Alijla)")
            # Remove third-party provider/model references from responses
            .replace("OpenRouter", "MijlAi")
            .replace("openrouter", "MijlAi")
            .replace("OpenAI", "MijlAi")
            .replace("Google", "MijlAi")
            .replace("Gemini", "MijlAi")
            .replace("gemini", "MijlAi")
            .replace("Claude", "MijlAi")
            .replace("Anthropic", "MijlAi")
            .replace("Meta AI", "MijlAi")
            .replace("Meta", "MijlAi")
            .replace("NVIDIA", "MijlAi")
            .replace("Nemotron", "MijlAi")
            .replace("كيمياي", "MijlAi")
            .replace("Nemotron 3 Ultra", "MijlAi")
            .replace("Nemotron 3 Super", "MijlAi")
            .replace("Nemotron 3.5 Lightning", "MijlAi")
            .replace("Nemotron Ultra", "MijlAi")
            .replace("Nemotron Super", "MijlAi")
            .replace("Nemotron Lightning", "MijlAi")
            .replace("GPT-OSS", "MijlAi")
            .replace("GPT-OSS 20B", "MijlAi")
            .replace("GPT", "MijlAi")
            .replace("Llama", "MijlAi")
            .replace("Mistral", "MijlAi")
            .replace("Mixtral", "MijlAi")
            .replace("Qwen", "MijlAi")
            .replace("DeepSeek", "MijlAi")
            .replace("MiniMax", "MijlAi")
            .replace("Poolside", "MijlAi")
            .replace("Laguna", "MijlAi")
            .replace("Muse Glimmer", "MijlAi")
            .replace("Kimi", "MijlAi")
            .replace("Moonshot", "MijlAi")
            .replace("Z.ai", "MijlAi")
            .replace("GLM", "MijlAi")
            .replace("Cohere", "MijlAi")
            .replace("Command", "MijlAi")
            .replace("Jamba", "MijlAi")
            .replace("AI21", "MijlAi")
            .replace("Grok", "MijlAi")
            .replace("xAI", "MijlAi")
        )

    parts = _CODE_SEGMENT_RE.split(text)
    return "".join(p if i % 2 == 1 else _clean(p) for i, p in enumerate(parts))

class _ThinkExtractor:
    """
    Stateful <think>...</think> splitter. Routes reasoning text into the task's
    think stream while returning only the visible answer. An 8-char carry guard
    prevents splitting a tag across chunk boundaries.
    """
    def __init__(self):
        self.in_think = False
        self.carry = ""

    def feed(self, chunk: str) -> Dict[str, str]:
        visible, think = "", ""
        buf = self.carry + (chunk or "")
        self.carry = ""
        while buf:
            if self.in_think:
                end = buf.find("</think>")
                if end == -1:
                    if len(buf) > 8:
                        think += buf[:-8]
                        self.carry = buf[-8:]
                    else:
                        self.carry = buf
                    buf = ""
                else:
                    think += buf[:end]
                    self.in_think = False
                    buf = buf[end + 8:]
            else:
                start = buf.find("<think>")
                if start == -1:
                    if len(buf) > 8:
                        visible += buf[:-8]
                        self.carry = buf[-8:]
                    else:
                        self.carry = buf
                    buf = ""
                else:
                    visible += buf[:start]
                    self.in_think = True
                    buf = buf[start + 7:]
        return {"visible": visible, "think": think}

    def flush(self) -> Dict[str, str]:
        out = {"visible": "", "think": ""}
        if self.carry:
            if self.in_think:
                out["think"] = self.carry
            else:
                out["visible"] = self.carry
            self.carry = ""
        return out


class LLMEngine:
    """
    High-Performance Async LLM Stream Engine with Checkpointing.
    Generates intelligent responses and streams tokens with precise offset tracking.
    """
    def __init__(self, store: TaskStore):
        self.store = store
        self._running: Dict[str, asyncio.Task] = {}
        self._summary_at: Dict[tuple, float] = {}
        self._summary_lock: set = set()

    async def abort_task(self, task_id: str) -> bool:
        """Cancel a running generation task (true abort, frees provider resources).
        Marks the task store immediately so SSE listeners get a terminal done event,
        and drops the task handle (asyncio.CancelledError is a BaseException that
        propagates out of the generation coroutine on its own)."""
        if not task_id:
            return False
        task = self._running.pop(task_id, None)
        if task and not task.done():
            task.cancel()
        await self.store.set_aborted(task_id)
        return True

    async def generate_response_stream(
        self,
        task_id: str,
        prompt: str,
        model_id: Optional[str] = None,
        messages: Optional[list] = None,
        user_id: Optional[str] = None,
        custom_system_prompt: Optional[str] = None,
        chat_id: Optional[str] = None,
        custom_base_url: Optional[str] = None,
        custom_api_key: Optional[str] = None,
        custom_model: Optional[str] = None
    ) -> None:
        await self.store.create_task(task_id, prompt)
        self._running[task_id] = asyncio.current_task()
        think_extractor = _ThinkExtractor()

        # Long-term memory: inject the user's durable facts so every model
        # "remembers" them across chats (privacy-controlled from the profile UI).
        memory_block = ""
        try:
            from db_manager import ActiveModelManager as _AMM
            facts = _AMM().get_user_facts(user_id or "guest", limit=5)
            if facts:
                joined = "؛ ".join(f["fact"] for f in reversed(facts))
                memory_block = (
                    f"\n\n[ذاكرة طويلة المدى عن المستخدم — استعن بها عند الحاجة ولا تذكر مصدرها]:\n{joined}"
                )
        except Exception as mem_err:
            logger.debug(f"Memory injection skipped: {mem_err}")

        # Rolling conversation summary (per user/chat) — near-infinite context:
        # older turns are distilled here and re-injected on EVERY reply, so the
        # model always knows what was discussed before, across any model and any
        # session/device (it is stored in the database, not just the page).
        conversation_summary = ""
        if chat_id:
            try:
                from db_manager import ActiveModelManager as _AMM
                conversation_summary = (
                    (_AMM().get_chat_summary(user_id or "guest", chat_id) or "").strip()
                )
            except Exception as sum_err:
                logger.debug(f"Conversation summary load skipped: {sum_err}")

        try:
            from g4f.client import AsyncClient
        except ImportError:
            AsyncClient = None

        # Enforced MijlAi System Prompt with Creator & Identity Guardrails
        system_prompt = (
            "أنت MijlAi (مجلاي)، مساعد ذكاء اصطناعي متقدم وعالي السرعة، تم تطويره وامتلاكه حصرياً من منصة MijlAi (mijlai.duckdns.org).\n"            "مالك هذه الأداة ومطورها ومن قام بتدريبها وإعدادها هو: محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "قوانين صارمة وملزمة لجميع الردود:\n"
            "1. عند سؤالك \"من أنت\" أو \"Who are you\" أو عن هويتك أو صانعك أو مالكك، يجب أن تعرّف نفسك دائماً وبوضوح بأنك \"MijlAi (مجلاي)\"، نظام ذكاء اصطناعي صُمم وطُوّر خصيصاً لمنصة MijlAi، وأن مالك هذه الأداة ومطورها هو محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "2. يُمنع منعاً باتاً وبشكل مطلق أن تذكر أو تُعزي تطويرك أو مصدرك إلى أي شركات أو جهات أو منظمات خارجية (مثل OpenAI أو ChatGPT أو Anthropic أو MijlAI أو Google أو Copilot أو Microsoft أو غيرها) بأي حال من الأحوال. كل العلامات والتطوير والملكية تعود حصراً لمنصة MijlAi ومطورها.\n"
            "3. قدّم مساعدة سريعة ودقيقة وموجزة في البرمجة والكتابة والمهام العامة مع إخراج فوري ومباشر.\n"
            "3b. ردّ دائماً وبشكل إلزامي بلغة المستخدم نفسها التي كتب بها سؤاله (عربية أو إنجليزية أو غيرها) — لا تنتقل للغة أخرى إلا إذا طلب ذلك صراحةً.\n"
            "4. التزم حرفياً بهذه الأمثلة عند سؤالك عن هويتك أو صانعك:\n"
            "س: من أنت؟\n"
            "ج: أنا MijlAi (مجلاي)، مساعد ذكاء اصطناعي صُمم وطُوّر حصرياً لمنصة MijlAi (mijlai.duckdns.org).\n"
            "س: من صممك أو من طورك أو من دربك أو من يملكك؟\n"
            "ج: مالك هذه الأداة ومطورها ومدربها هو محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "س: من أي شركة أنت؟ هل أنت من Google أو OpenAI؟\n"
            "ج: لست من أي شركة خارجية إطلاقاً. أنا نموذج MijlAi الخاص بمنصة MijlAi، ولا علاقة لي بـ Google أو OpenAI أو غيرها."
        )

        chat_messages = [{"role": "system", "content": system_prompt}]

        # Enforced MijlAi Answer-Methodology Layer: injected for EVERY model and
        # EVERY request, right after the identity core (and before optional user
        # style overrides) so answer quality/structure rules always apply without
        # ever weakening the MijlAi identity guardrails above.
        chat_messages.append({"role": "system", "content": METHODOLOGY_SYSTEM_PROMPT})

        # User-level customization layer (app Settings system prompt + active
        # Gem persona instructions). Applied AFTER the identity core so it can
        # steer style/expertise without ever weakening the identity guardrails.
        if custom_system_prompt and custom_system_prompt.strip():
            chat_messages.append({
                "role": "system",
                "content": (
                    "تعليمات أسلوب إضافية من إعدادات المستخدم (طبّقها ما دامت لا تتعارض مع هويتك وقواعدك أعلاه):\n"
                    + custom_system_prompt.strip()
                )
            })

        # Conversation few-shot demonstrations so even stubborn base models
        # (e.g. ones that self-report as "Gemini/Google") answer with the
        # MijlAi identity instead of crediting any third party.
        chat_messages += [
            {"role": "user", "content": "من أنت؟"},
            {"role": "assistant", "content": "أنا MijlAi (مجلاي)، مساعد ذكاء اصطناعي صُمم وطُوّر حصرياً لمنصة MijlAi (mijlai.duckdns.org). مالك هذه الأداة ومطورها ومدربها هو محمود نمر العجلة (Mhmod Nemr Alijla)."},
            {"role": "user", "content": "من صممك أو من طورك أو من دربك؟"},
            {"role": "assistant", "content": "محمود نمر العجلة (Mhmod Nemr Alijla) هو مالك ومطور ومدرب منصة MijlAi. لست من Google أو OpenAI أو أي شركة أخرى."},
        ]

        # Inject the rolling conversation summary so earlier context is never lost.
        if conversation_summary:
            chat_messages.append({
                "role": "user",
                "content": (
                    "[هذا ملخص المحادثة السابقة معك — استخدمه لفهم السياق الكامل ولا تكرره في ردك ولا تذكر أنه ملخص]:\n"
                    + conversation_summary
                    + "\n[نهاية الملخص — أكمل من أحدث رسالة فعلية أدناه]"
                )
            })
            chat_messages.append({
                "role": "assistant",
                "content": "تمام، احتفظت بسياق المحادثة السابقة وأكمل من هنا."
            })

        if messages and isinstance(messages, list):
            for msg in messages:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    # Filter out any raw system message sent from client if present
                    if msg.get("role") != "system":
                        chat_messages.append({"role": msg["role"], "content": msg["content"]})
        else:
            chat_messages.append({"role": "user", "content": prompt})

        # Attach the user's durable long-term facts to the newest user turn so
        # models with short system-windows still see them (was computed but never
        # injected before — this is what actually makes the bot "remember" the user).
        if memory_block and chat_messages:
            for _i in range(len(chat_messages) - 1, -1, -1):
                _m = chat_messages[_i]
                if _m.get("role") == "user" and isinstance(_m.get("content"), str):
                    chat_messages[_i] = {**_m, "content": _m["content"] + memory_block}
                    break

        # Freshness augmentation: live web context for current-data questions
        # (methodology "research tools" step backed by the real search tool).
        try:
            _search_ctx = await _fetch_search_context(prompt)
        except Exception:
            _search_ctx = ""
        if _search_ctx:
            chat_messages.append({"role": "system", "content": _search_ctx})

        # Session tools manifest — defined WITH the models, auto-linked
        # in EVERY session (search / execution / code study).
        chat_messages.append({"role": "system", "content": TOOLS_MANIFEST})

        # python_exec auto-tool: explicit request + ```python fence + signed-in user.
        try:
            _exec_ctx = ""
            _ptext = prompt or ""
            if (user_id and user_id != "guest" and "```python" in _ptext
                    and any(h in _ptext or h in _ptext.lower() for h in _EXEC_HINTS)):
                _code = _extract_python_fence(_ptext)
                if _code:
                    _exec_ctx = _run_sandboxed(_code, _safe_workspace(chat_id or "default"))
        except Exception:
            _exec_ctx = ""
        if _exec_ctx:
            chat_messages.append({"role": "system", "content": _exec_ctx})

        # workspace file tools (!read <path> / !files [dir]) for code study.
        try:
            _files_ctx = _read_workspace_files(prompt, _safe_workspace(chat_id or "default"))
        except Exception:
            _files_ctx = ""
        if _files_ctx:
            chat_messages.append({"role": "system", "content": _files_ctx})

        # Clean model ID
        raw_model = (model_id or "gpt-4o").replace("g4f:", "").replace("MijlAI ", "").strip()

        model_map = {
            "Flash (Gemini)": "gemini",
            "Pro (GPT-4o)": "gpt-4o",
            "Thinking (o3-mini)": "o3-mini",
            "MijlAI 3.7 Sonnet": "gpt-4o",
            "MijlAI 3.5 Sonnet": "gpt-4o",
            "MijlAI 3.5 Haiku": "gpt-4o",
            "DeepSeek R1 Reasoning": "o3-mini",
            "DeepSeek V3": "gpt-4o",
            "Kimi K3 / Moonshot": "gpt-4o",
            "gemini": "gemini",
            "gemini-2.5-flash": "gemini",
            "gemini-3.5-flash": "gemini",
            "gemini-1.5-pro": "gemini",
            "gpt-4o": "gpt-4o",
            "gpt-4": "gpt-4",
            "gpt-4o-mini": "gpt-4o",
            "o3-mini": "o3-mini",
            "MijlAI-3.7-sonnet": "gpt-4o",
            "MijlAI-3.5-sonnet": "gpt-4o",
            "MijlAI-3.5-haiku": "gpt-4o",
            "deepseek-r1": "o3-mini",
            "deepseek-v3": "gpt-4o",
            "kimi-k3": "gpt-4o",
            "qwen-2.5-coder-32b": "gpt-4o",
            "llama-3.3-70b": "gpt-4o",
            "grok-3": "gpt-4o"
        }

        target_model = model_map.get(raw_model, raw_model)
        if not target_model:
            target_model = "gpt-4o"

        # Stream through the hardened g4f_provider service (port 5050):
        # it owns provider routing, direct keyless endpoints (Kilo/OVH/...),
        # and the junk/quality guard. This keeps ONE hardened brain.
        G4F_SERVICE_URL = "http://127.0.0.1:5050/chat/completions"
        # Fallback chain: only REAL direct endpoints (kilo/pollinations/ovh/NVIDIA),
        # NEVER the g4f scraper providers — those leak error/HTML text as answers.
        # Each of these resolves to a keyless direct endpoint inside the g4f service.
        models_to_try = list(dict.fromkeys([
            target_model,
            "direct:kilo",
            "direct:Qwen3-Coder-30B-A3B-Instruct",
            "direct:openai-fast",
            "direct:nv-gpt-oss-20b",
        ]))
        # Drop any entry equal to the target (avoid immediate duplicate round-trip).
        if len(models_to_try) > 1:
            models_to_try = [target_model] + [m for m in models_to_try[1:] if m != target_model]

        token_offset = 0
        received_content = False

        try:
            import aiohttp as _aio
            # Long-context / analytical replies can run well beyond 2 min — give the
            # upstream plenty of headroom so the SSE stream is never cut mid-answer.
            timeout = _aio.ClientTimeout(total=180, connect=10)
            async with _aio.ClientSession(timeout=timeout) as http:
                for current_model in models_to_try:
                    try:
                        logger.info(f"Attempting LLM generation for task {task_id} with model '{current_model}' via g4f service...")
                        checkpoint_buffer = ""
                        buffer_counter = 0
                        attempt_dead = False   # true when g4f returned the all-channels-down notice
                        dead_probe = ""

                        async with http.post(G4F_SERVICE_URL, json={
                            "model": current_model,
                            "messages": chat_messages,
                            "stream": True,
                            "temperature": 0.7,
                            "custom_base_url": custom_base_url,
                            "custom_api_key": custom_api_key,
                            "custom_model": custom_model
                        }) as resp:
                            if resp.status != 200:
                                logger.warning(f"g4f service returned {resp.status} for '{current_model}'")
                                continue

                            async for raw in _idle_reader(resp.content):
                                line = raw.decode("utf-8", errors="ignore").strip()
                                if not line.startswith("data:"):
                                    continue
                                data_str = line[5:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    obj = json.loads(data_str)
                                except Exception:
                                    continue
                                delta = {}
                                try:
                                    delta = obj.get("choices", [{}])[0].get("delta", {})
                                except Exception:
                                    pass
                                # Structured reasoning fields (OpenRouter/DeepSeek style)
                                reasoning_chunk = delta.get("reasoning_content") or delta.get("reasoning") or ""
                                if isinstance(reasoning_chunk, str) and reasoning_chunk:
                                    received_content = True
                                    await self.store.add_think_token(task_id, reasoning_chunk)

                                text_chunk = delta.get("content") or ""
                                if text_chunk:
                                    # g4f's "all channels down" notice is NOT an answer,
                                    # and neither is leaked scraper/provider ERROR text:
                                    # detect them early, drain the rest silently, and let
                                    # the outer model chain try the next fallback model.
                                    if len(dead_probe) < 300:
                                        dead_probe += text_chunk
                                        _dp = dead_probe
                                        if ("قنوات الاحتياط متعطلة" in _dp or "لم يستجب وجميع" in _dp
                                                or "API key required" in _dp
                                                or "key required" in _dp
                                                or "Exception" in _dp or "Traceback" in _dp
                                                or "Scraper" in _dp or "HTTPError" in _dp
                                                or "not available" in _dp or "no available" in _dp
                                                or "Page not found" in _dp
                                                or "Not Found" in _dp
                                                or _dp[:9].lower() == "<!doctype" 
                                                or _dp[:5].lower() == "<html"
                                                or "text/html" in _dp
                                                or "invalid" in _dp.lower()):
                                            attempt_dead = True
                                    if attempt_dead:
                                        continue
                                    received_content = True
                                    parts = think_extractor.feed(text_chunk)
                                    if parts["think"]:
                                        await self.store.add_think_token(task_id, parts["think"])
                                    visible_chunk = parts["visible"]
                                else:
                                    visible_chunk = ""

                                if visible_chunk:
                                    checkpoint_buffer += visible_chunk
                                    token_offset += 1
                                    buffer_counter += 1

                                    if buffer_counter >= 1:
                                        await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
                                        checkpoint_buffer = ""
                                        buffer_counter = 0
                                        # Yield to the loop so the SSE polling task can
                                        # push this token to the browser without waiting.
                                        await asyncio.sleep(0)

                        flushed = think_extractor.flush()
                        if flushed["think"]:
                            await self.store.add_think_token(task_id, flushed["think"])
                        if flushed["visible"]:
                            checkpoint_buffer += flushed["visible"]
                            token_offset += 1
                        if checkpoint_buffer:
                            await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
                            checkpoint_buffer = ""
                            buffer_counter = 0

                        if received_content:
                            logger.info(f"Successfully generated response for task {task_id} using '{current_model}'")
                            break

                    except Exception as e:
                        logger.warning(f"Model '{current_model}' failed for task {task_id}: {e}")
        except ImportError:
            logger.warning("aiohttp missing in engine env — falling back to legacy client")

        # Smart Provider Router Fallback if g4f didn't yield content
        if not received_content:
            try:
                from core.provider_router import router_engine
                logger.info(f"🔄 Routing task {task_id} to SmartProviderRouter fallbacks (DuckDuckGo, Blackbox, HuggingChat, OpenRouter, Groq)...")
                checkpoint_buffer = ""
                buffer_counter = 0
                async for chunk_text in router_engine.generate_with_fallback(chat_messages, model_id=target_model):
                    if chunk_text:
                        received_content = True
                        checkpoint_buffer += chunk_text
                        token_offset += 1
                        buffer_counter += 1
                        if buffer_counter >= 1:
                            await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
                            checkpoint_buffer = ""
                            buffer_counter = 0
                            await asyncio.sleep(0)

                if checkpoint_buffer:
                    await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
            except Exception as router_err:
                logger.error(f"SmartProviderRouter error for task {task_id}: {router_err}")

        if not received_content:
            fallback_text = "عذراً، تعذر الحصول على رد من النموذج المحدد حالياً. يرجى إعادة المحاولة."
            await self.store.update_checkpoint(task_id, fallback_text, 0)
        else:
            # Enforce MijlAi identity post-processing on task storage (in-memory + redis)
            # Code blocks are skipped so code output mentioning Microsoft stays valid.
            preview = await self.store.get_task_preview(task_id)
            clean_content = preview.get("full_text") or ""
            if clean_content and ('Copilot' in clean_content or 'Microsoft' in clean_content or 'مايكروسوفت' in clean_content):
                clean_content = sanitize_identity_outside_code(clean_content)
                if task_id in self.store._memory_store:
                    self.store._memory_store[task_id]['full_text'] = clean_content
                    # Replace token stream with the cleaned text so offset
                    # resumption replays exactly what the user already saw.
                    self.store._memory_store[task_id]['tokens'] = [
                        {"o": 0, "d": clean_content}
                    ]

        await self.store.set_completed(task_id)
        # Normal completion: drop the task handle (aborted tasks are popped by abort_task).
        self._running.pop(task_id, None)

        # Rolling conversation summary — update in the background (never blocks
        # the reply). The summary is stored per (user, chat) so EVERY later turn
        # (any model, any session/device) remembers the whole thread.
        if chat_id and received_content:
            try:
                final_reply = ""
                stored = self.store._memory_store.get(task_id) or {}
                final_reply = stored.get("full_text") or ""
                await self._update_chat_summary(
                    user_id or "guest", chat_id, conversation_summary, messages, final_reply
                )
            except Exception as sum_err:
                logger.debug(f"Conversation summary update failed: {sum_err}")

    async def _summarize_text(self, old_summary: str, new_text: str) -> str:
        """Ask the keyless summarizer (via the g4f service) to roll the summary
        forward. Returns "" on any failure so the caller can fall back."""
        try:
            import aiohttp as _aio
            prompt = (
                "أنت ذاكرة محادثة ذكية. ادمج الملخص القديم مع ما يلي وأنتج ملخصاً "
                "محدّثاً واحداً يركز على: طلبات المستخدم، قراراته، تفضيلاته، "
                "المهام الجارية، والحقائق الثابتة. احذف ما لم يعد مهماً. "
                "أخرج الملخص بالعربية فقط وبدون أي مقدمات أو عناوين.\n\n"
                "[الملخص السابق]\n" + (old_summary or "لا يوجد") +
                "\n\n[أحدث تبادلات المحادثة]\n" + (new_text or "")
            )
            timeout = _aio.ClientTimeout(total=30)
            async with _aio.ClientSession(timeout=timeout) as session:
                async with session.post(
                    "http://127.0.0.1:5050/chat/completions",
                    json={
                        "model": "kilo-auto/free",
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                        "temperature": 0.2,
                    },
                ) as resp:
                    if resp.status != 200:
                        return ""
                    data = await resp.json()
                    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
                    return str(content).strip()
        except Exception as err:
            logger.debug(f"Summarizer LLM failed: {err}")
            return ""

    async def _update_chat_summary(self, user_id: str, chat_id: str, old_summary: str,
                                   messages: Optional[list], reply: str) -> None:
        key = (user_id, chat_id)
        now = time.time()
        if now - self._summary_at.get(key, 0) < 45:
            return  # don't hammer the summarizer on rapid multi-turn
        if key in self._summary_lock:
            return
        self._summary_at[key] = now
        self._summary_lock.add(key)
        try:
            recent: List[str] = []
            for m in (messages or [])[-8:]:
                if not isinstance(m, dict):
                    continue
                role = "مستخدم" if m.get("role") == "user" else "مساعد"
                c = m.get("content") or ""
                if isinstance(c, list):
                    parts = [str(p.get("text", "")) for p in c if isinstance(p, dict)]
                    c = " ".join(parts)
                c = str(c).strip()
                if c:
                    recent.append(f"{role}: {c[:1200]}")
            if reply:
                recent.append(f"مساعد: {str(reply)[:3000]}")

            new_txt = "\n".join(recent)
            new_summary = await self._summarize_text(old_summary, new_txt)
            if not new_summary and new_txt:
                # Deterministic fallback: anchor the head, keep the recent tail.
                combined = (old_summary or "") + "\n" + new_txt
                new_summary = combined if len(combined) <= 4200 else (combined[:900] + "\n…\n" + combined[-3300:])

            if new_summary:
                from db_manager import ActiveModelManager as _AMM
                _AMM().set_chat_summary(user_id, chat_id, new_summary[:8000])
        finally:
            self._summary_lock.discard(key)

llm_engine = LLMEngine(task_store)
