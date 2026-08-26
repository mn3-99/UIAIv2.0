# core/provider_router.py
import asyncio
import time
import random
import logging
from typing import AsyncGenerator, List, Dict, Optional
from dataclasses import dataclass
from enum import Enum

from scrapers.duckduckgo_scraper import DuckDuckGoAIScraper
from scrapers.huggingchat_scraper import HuggingChatScraper
from scrapers.blackbox_scraper import BlackboxScraper
from scrapers.you_scraper import YouScraper
from providers.openrouter_free import OpenRouterFreeProvider
from providers.groq_free import GroqFreeProvider
from providers.together_free import TogetherFreeProvider
from providers.cerebras_free import CerebrasFreeProvider
from providers.pollinations_free import PollinationsFreeProvider
from providers.tokenhub_free import TokenHubFreeProvider

logger = logging.getLogger("provider_router")

class ProviderTier(Enum):
    TIER_1_DIRECT = 1
    TIER_2_SCRAPER = 2
    TIER_3_G4F = 3
    TIER_4_LOCAL = 4

@dataclass
class ProviderResult:
    provider_name: str
    tier: ProviderTier
    latency_ms: float
    success: bool
    error_message: Optional[str] = None

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_counts: Dict[str, int] = {}
        self.last_failure_time: Dict[str, float] = {}
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout

    def is_open(self, provider: str) -> bool:
        if provider not in self.failure_counts:
            return False
        if self.failure_counts[provider] < self.failure_threshold:
            return False
        if time.time() - self.last_failure_time.get(provider, 0) > self.recovery_timeout:
            self.failure_counts[provider] = 0
            return False
        return True

    def record_failure(self, provider: str):
        self.failure_counts[provider] = self.failure_counts.get(provider, 0) + 1
        self.last_failure_time[provider] = time.time()

    def record_success(self, provider: str):
        self.failure_counts[provider] = 0

class SmartProviderRouter:
    def __init__(self):
        self.providers = {
            "duckduckgo": {"tier": ProviderTier.TIER_2_SCRAPER, "weight": 0.95, "instance": DuckDuckGoAIScraper()},
            "blackbox": {"tier": ProviderTier.TIER_2_SCRAPER, "weight": 0.90, "instance": BlackboxScraper()},
            "openrouter": {"tier": ProviderTier.TIER_1_DIRECT, "weight": 0.85, "instance": OpenRouterFreeProvider()},
            "huggingchat": {"tier": ProviderTier.TIER_2_SCRAPER, "weight": 0.80, "instance": HuggingChatScraper()},
            "groq": {"tier": ProviderTier.TIER_1_DIRECT, "weight": 1.0, "instance": GroqFreeProvider()},
            "together": {"tier": ProviderTier.TIER_1_DIRECT, "weight": 0.9, "instance": TogetherFreeProvider()},
            "cerebras": {"tier": ProviderTier.TIER_1_DIRECT, "weight": 1.0, "instance": CerebrasFreeProvider()},
            # Tencent TokenHub free quota (16 models x 1M tokens, exp 2027) —
            # high weight: reliable OpenAI-compatible gateway with real models
            "tokenhub": {"tier": ProviderTier.TIER_1_DIRECT, "weight": 0.95, "instance": TokenHubFreeProvider()},
            # Verified keyless but heavily rate-limited per IP (2026-08):
            # low weight = last-resort only; yields "" on 429 so chain continues
            "pollinations": {"tier": ProviderTier.TIER_1_DIRECT, "weight": 0.55, "instance": PollinationsFreeProvider()},
            "you": {"tier": ProviderTier.TIER_2_SCRAPER, "weight": 0.75, "instance": YouScraper()}
        }
        self.provider_stats: Dict[str, List[ProviderResult]] = {}
        self.circuit_breaker = CircuitBreaker()

    def select_provider(self, model_id: str, preferred_tier: ProviderTier = None) -> str:
        available = []
        for name, config in self.providers.items():
            if preferred_tier and config["tier"] != preferred_tier:
                continue
            if self.circuit_breaker.is_open(name):
                continue
            stats = self.provider_stats.get(name, [])
            success_rate = sum(1 for s in stats if s.success) / len(stats) if stats else 0.8
            avg_latency = sum(s.latency_ms for s in stats) / len(stats) if stats else 300
            score = config["weight"] * success_rate * (1000 / (avg_latency + 100))
            available.append((name, score))

        if not available:
            return "duckduckgo"

        total_score = sum(s for _, s in available)
        r = random.uniform(0, total_score)
        cumulative = 0
        for name, score in available:
            cumulative += score
            if r <= cumulative:
                return name
        return available[-1][0]

    def _record_result(self, provider_name: str, success: bool, latency_ms: float, error_message: str = None):
        if provider_name not in self.provider_stats:
            self.provider_stats[provider_name] = []
        tier = self.providers.get(provider_name, {}).get("tier", ProviderTier.TIER_2_SCRAPER)
        self.provider_stats[provider_name].append(
            ProviderResult(provider_name, tier, latency_ms, success, error_message)
        )
        if len(self.provider_stats[provider_name]) > 50:
            self.provider_stats[provider_name].pop(0)

    async def generate_with_fallback(self, messages: list, model_id: str = "gpt-4o", max_attempts: int = 3) -> AsyncGenerator[str, None]:
        tried = set()
        for attempt in range(max_attempts):
            provider_name = self.select_provider(model_id)
            if provider_name in tried:
                remaining = [p for p in self.providers if p not in tried and not self.circuit_breaker.is_open(p)]
                if not remaining:
                    break
                provider_name = random.choice(remaining)

            tried.add(provider_name)
            start_time = time.time()
            chunk_count = 0
            try:
                provider_cfg = self.providers.get(provider_name)
                instance = provider_cfg["instance"] if provider_cfg else DuckDuckGoAIScraper()

                if provider_name == "you":
                    prompt_text = messages[-1]["content"] if messages else ""
                    stream = instance.chat_stream(prompt_text)
                else:
                    stream = instance.chat_stream(messages, model=model_id)

                async for chunk in stream:
                    if chunk:
                        chunk_count += 1
                        yield chunk

                latency = (time.time() - start_time) * 1000
                if chunk_count > 0:
                    self._record_result(provider_name, True, latency)
                    self.circuit_breaker.record_success(provider_name)
                    return
                else:
                    raise Exception("Empty response received")

            except Exception as e:
                latency = (time.time() - start_time) * 1000
                self._record_result(provider_name, False, latency, str(e))
                self.circuit_breaker.record_failure(provider_name)

        yield "⚠️ MijlAI System: Fallback routing active. Default response generated."

router_engine = SmartProviderRouter()
