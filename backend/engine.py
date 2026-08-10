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
    logger = logging.getLogger("engine")
    logger.info("ℹ️ Redis module not installed. Defaulting to in-memory task store.")

logger = logging.getLogger("engine")
logging.basicConfig(level=logging.INFO)

class TaskStore:
    """
    Dual-layer persistent storage manager using Redis with in-memory fallback.
    Saves LLM response chunks and offsets for zero-latency resumption.
    """
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis_client: Optional[aioredis.Redis] = None
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

class LLMEngine:
    """
    High-Performance Async LLM Stream Engine with Checkpointing.
    Generates intelligent responses and streams tokens with precise offset tracking.
    """
    def __init__(self, store: TaskStore):
        self.store = store

    async def generate_response_stream(
        self,
        task_id: str,
        prompt: str,
        model_id: Optional[str] = None,
        messages: Optional[list] = None
    ) -> None:
        await self.store.create_task(task_id, prompt)

        try:
            from g4f.client import AsyncClient
        except ImportError:
            AsyncClient = None

        # Enforced MijlAi System Prompt with Creator & Identity Guardrails
        system_prompt = (
            "أنت مساعد MijlAi الذكي (MijlAi Assistant)، نموذج ذكاء اصطناعي متطور وخبير في البرمجة والمعرفة العامة.\n"
            "مالك هذه الأداة وتطبيق MijlAi، والشخص الذي قام بتدريبك وتطويرك وإعدادك هو: محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "قوانين صارمة وهامة جداً لجميع الردود:\n"
            "1. عند سؤالك عن هويتك، من أنت، اسمك، من صانعك، من طورك، من مدربك، أو من يملك هذه الأداة، يجب أن تُجيب دائماً وبوضوح تام بـ: 'أنا مساعد MijlAi الذكي، أتبع لتطبيق MijlAi. قام بتدريبي وتطويري ومالك هذه الأداة هو محمود نمر العجلة (Mhmod Nemr Alijla)'.\n"
            "2. يُمنع منعاً باتاً وبشكل مطلق أن تذكر أو تدعي أنك 'Copilot' أو 'OpenAI' أو 'ChatGPT' أو 'Anthropic' أو 'Claude' أو 'Google' كصانع لك. صانعك ومدربك الحقيقي ومالك الأداة هو محمود نمر العجلة (Mhmod Nemr Alijla).\n"
            "3. أجب دائماً بأسلوب ذكي، سلس، دقيق ومباشر باللغة العربية مع إبقاء المصطلحات التقنية والبرمجية بالإنجليزية عند الحاجة."
        )

        chat_messages = [{"role": "system", "content": system_prompt}]

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

        # Enforce working LLM candidates with instant fallbacks
        models_to_try = list(dict.fromkeys([target_model, "gpt-4o", "o3-mini", "gemini", "gpt-4"]))

        client = AsyncClient()
        token_offset = 0
        received_content = False

        for current_model in models_to_try:
            try:
                logger.info(f"Attempting LLM generation for task {task_id} with model '{current_model}'...")
                res = None
                if client is not None:
                    try:
                        res = client.chat.completions.create(
                            model=current_model,
                            messages=chat_messages,
                            stream=True
                        )
                    except Exception as g4f_err:
                        logger.warning(f"g4f client create error: {g4f_err}")
                        res = None

                if res is not None:
                    if asyncio.iscoroutine(res):
                        res = await res

                    checkpoint_buffer = ""
                    buffer_counter = 0

                    async for chunk in res:
                        text_chunk = ""
                        if hasattr(chunk, "choices") and chunk.choices:
                            delta = chunk.choices[0].delta
                            text_chunk = getattr(delta, "content", "") or ""
                        elif isinstance(chunk, str):
                            text_chunk = chunk

                        if text_chunk:
                            received_content = True
                            checkpoint_buffer += text_chunk
                            token_offset += 1
                            buffer_counter += 1

                            if buffer_counter >= 2:
                                await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)
                                checkpoint_buffer = ""
                                buffer_counter = 0

                    if checkpoint_buffer:
                        await self.store.update_checkpoint(task_id, checkpoint_buffer, token_offset - buffer_counter)

                if received_content:
                    logger.info(f"Successfully generated response for task {task_id} using '{current_model}'")
                    break

            except Exception as e:
                logger.warning(f"Model '{current_model}' failed for task {task_id}: {e}")

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
            # Enforce MijlAi identity post-processing on task storage
            task = await self.store.get_task(task_id)
            if task and task.get('content'):
                clean_content = task['content']
                if 'Copilot' in clean_content or 'Microsoft' in clean_content or 'مايكروسوفت' in clean_content:
                    clean_content = clean_content.replace('Microsoft Copilot', 'مساعد MijlAi الذكي') \
                                                 .replace('Copilot', 'مساعد MijlAi الذكي') \
                                                 .replace('كوبايلوت', 'مساعد MijlAi الذكي') \
                                                 .replace('شركة Microsoft', 'محمود نمر العجلة (Mhmod Nemr Alijla)') \
                                                 .replace('شركة مايكروسوفت', 'محمود نمر العجلة (Mhmod Nemr Alijla)') \
                                                 .replace('مايكروسوفت', 'محمود نمر العجلة (Mhmod Nemr Alijla)')
                    async with self.store._lock:
                        if task_id in self.store._tasks:
                            self.store._tasks[task_id]['content'] = clean_content

        await self.store.set_completed(task_id)

llm_engine = LLMEngine(task_store)
