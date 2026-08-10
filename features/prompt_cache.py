# features/prompt_cache.py
import hashlib
import json
import time
from typing import Optional, Dict

class PromptCache:
    """
    High-performance in-memory prompt caching layer with TTL expiration.
    """
    def __init__(self, ttl: int = 3600):
        self.cache: Dict[str, Dict] = {}
        self.ttl = ttl

    def _generate_key(self, messages: list, model: str, temperature: float) -> str:
        content = json.dumps({"messages": messages, "model": model, "temp": temperature}, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

    def get(self, messages: list, model: str, temperature: float = 0.7) -> Optional[str]:
        key = self._generate_key(messages, model, temperature)
        entry = self.cache.get(key)
        if not entry:
            return None
        if time.time() - entry["created_at"] > self.ttl:
            del self.cache[key]
            return None
        return entry["response"]

    def set(self, messages: list, model: str, response: str, temperature: float = 0.7):
        key = self._generate_key(messages, model, temperature)
        self.cache[key] = {
            "response": response,
            "created_at": time.time()
        }

prompt_cache = PromptCache()
