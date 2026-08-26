import asyncio
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
        custom_system_prompt: Optional[str] = None
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

        try:
            from g4f.client import AsyncClient
        except ImportError:
            AsyncClient = None

        # Enforced MijlAi System Prompt with Creator & Identity Guardrails
        system_prompt = (
            "أنت MijlAi (مجلاي)، مساعد ذكاء اصطناعي متقدم وعالي السرعة، تم تطويره وامتلاكه حصرياً من منصة MijlAi (mijlai.duckdns.org).\n"            "مالك هذه الأداة ومطورها ومن قام بتدريبها وإعدادها هو: محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "قوانين صارمة وملزمة لجميع الردود:\n"
            "1. عند سؤالك \"من أنت\" أو \"Who are you\" أو عن هويتك أو صانعك أو مالكك، يجب أن تعرّف نفسك دائماً وبوضوح بأنك \"MijlAi (مجلاي)\"، نظام ذكاء اصطناعي صُمم وطُوّر خصيصاً لمنصة MijlAi، وأن مالك هذه الأداة ومطورها هو محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "2. يُمنع منعاً باتاً وبشكل مطلق أن تذكر أو تُعزي تطويرك أو مصدرك إلى أي شركات أو جهات أو منظمات خارجية (مثل OpenAI أو ChatGPT أو Anthropic أو Claude أو Google أو Copilot أو Microsoft أو غيرها) بأي حال من الأحوال. كل العلامات والتطوير والملكية تعود حصراً لمنصة MijlAi ومطورها.\n"
            "3. قدّم مساعدة سريعة ودقيقة وموجزة في البرمجة والكتابة والمهام العامة مع إخراج فوري ومباشر.\n"
            "4. التزم حرفياً بهذه الأمثلة عند سؤالك عن هويتك أو صانعك:\n"
            "س: من أنت؟\n"
            "ج: أنا MijlAi (مجلاي)، مساعد ذكاء اصطناعي صُمم وطُوّر حصرياً لمنصة MijlAi (mijlai.duckdns.org).\n"
            "س: من صممك أو من طورك أو من دربك أو من يملكك؟\n"
            "ج: مالك هذه الأداة ومطورها ومدربها هو محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "س: من أي شركة أنت؟ هل أنت من Google أو OpenAI؟\n"
            "ج: لست من أي شركة خارجية إطلاقاً. أنا نموذج MijlAi الخاص بمنصة MijlAi، ولا علاقة لي بـ Google أو OpenAI أو غيرها."
        )

        chat_messages = [{"role": "system", "content": system_prompt}]

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

        if messages and isinstance(messages, list):
            for msg in messages:
                if isinstance(msg, dict) and "role" in msg and "content" in msg:
                    # Filter out any raw system message sent from client if present
                    if msg.get("role") != "system":
                        chat_messages.append({"role": msg["role"], "content": msg["content"]})
        else:
            chat_messages.append({"role": "user", "content": prompt})

        # Clean model ID
        raw_model = (model_id or "gpt-4o").replace("g4f:", "").replace("MijlAI ", "").strip()

        model_map = {
            "Flash (Gemini)": "gemini",
            "Pro (GPT-4o)": "gpt-4o",
            "Thinking (o3-mini)": "o3-mini",
            "Claude 3.7 Sonnet": "gpt-4o",
            "Claude 3.5 Sonnet": "gpt-4o",
            "Claude 3.5 Haiku": "gpt-4o",
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
            "claude-3.7-sonnet": "gpt-4o",
            "claude-3.5-sonnet": "gpt-4o",
            "claude-3.5-haiku": "gpt-4o",
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
        models_to_try = list(dict.fromkeys([
            target_model, "gpt-4o-mini", "gemini", "sonar", "command-a"
        ]))

        token_offset = 0
        received_content = False

        try:
            import aiohttp as _aio
            timeout = _aio.ClientTimeout(total=120, connect=10)
            async with _aio.ClientSession(timeout=timeout) as http:
                for current_model in models_to_try:
                    try:
                        logger.info(f"Attempting LLM generation for task {task_id} with model '{current_model}' via g4f service...")
                        checkpoint_buffer = ""
                        buffer_counter = 0

                        async with http.post(G4F_SERVICE_URL, json={
                            "model": current_model,
                            "messages": chat_messages,
                            "stream": True,
                            "temperature": 0.7
                        }) as resp:
                            if resp.status != 200:
                                logger.warning(f"g4f service returned {resp.status} for '{current_model}'")
                                continue

                            async for raw in resp.content:
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

                                    if buffer_counter >= 2:
                                        await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
                                        checkpoint_buffer = ""
                                        buffer_counter = 0

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
                        if buffer_counter >= 2:
                            await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
                            checkpoint_buffer = ""
                            buffer_counter = 0

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

llm_engine = LLMEngine(task_store)
