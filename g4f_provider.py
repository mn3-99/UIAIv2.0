#!/usr/bin/env python3
"""
g4f_provider.py — GPT4Free (g4f) Backend Service Module
Provides model discovery with health checking, OpenAI-compatible chat completions,
and SSE streaming using g4f.AsyncClient.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
import warnings
from typing import List, Dict, Any, Optional

# Ignore unclosed session resource warnings from background provider health-checks
warnings.filterwarnings("ignore", category=ResourceWarning)
warnings.filterwarnings("ignore", message=".*Unclosed.*")
warnings.filterwarnings("ignore", message=".*connector.*")

try:
    from aiohttp import web
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    print("⚠️ [g4f_provider.py] aiohttp not installed in Python environment.")

try:
    import g4f
    from g4f.client import AsyncClient
    import g4f.models as m
    G4F_AVAILABLE = True
except ImportError:
    G4F_AVAILABLE = False
    print("⚠️ [g4f_provider.py] g4f package not installed in Python environment.")

from provider_monitor import start_background_monitor_loop
from db_manager import ActiveModelManager
from background_worker import run_background_pipeline, schedule_worker

# ---------------------------------------------------------------------------
# Persistent HTTP/2 client for direct OpenAI-compatible endpoints.
# Re-using one AsyncClient across requests (instead of opening a brand-new
# session per call) keeps the TLS + TCP handshake warm, which is the single
# biggest source of first-token latency for the mijlai-* agents.
# ---------------------------------------------------------------------------
try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    logger.warning("[g4f_provider] httpx not installed — direct endpoints will fall back to aiohttp.")

_HTTPX_CLIENT: Optional["httpx.AsyncClient"] = None

def get_httpx_client() -> "httpx.AsyncClient":
    """Return a process-wide, HTTP/2-capable async client (lazily created)."""
    global _HTTPX_CLIENT
    if _HTTPX_CLIENT is None or _HTTPX_CLIENT.is_closed:
        # Generous timeouts: long analytical replies need headroom; connect is tight.
        _HTTPX_CLIENT = httpx.AsyncClient(
            http2=True,
            timeout=httpx.Timeout(connect=10, read=120, write=30, pool=30),
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=40,
                keepalive_expiry=60.0,
            ),
            follow_redirects=True,
        )
    return _HTTPX_CLIENT

# Configure logging
logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("g4f_provider")
logger.setLevel(logging.INFO)

# Suppress internal g4f and asyncio verbose logs
logging.getLogger("g4f").setLevel(logging.CRITICAL)
logging.getLogger("asyncio").setLevel(logging.CRITICAL)

if G4F_AVAILABLE:
    # Auto-disable every provider that requires credentials/HAR files/cookies
    for provider_name in dir(g4f.Provider):
        if provider_name.startswith('_'):
            continue
        try:
            p = getattr(g4f.Provider, provider_name)
            if getattr(p, 'needs_auth', False):
                p.working = False
        except Exception:
            pass
    # Disable known problematic or environment-incompatible providers (browser-dependent, PoW-gated, blocked from datacenter IPs)
    for provider_name in ["Puter", "CablyAI", "TeachAnything", "Replicate", "OpenRouter", "Airforce",
                          "Grok", "Together", "DeepInfra", "Cloudflare", "Copilot", "CopilotApp",
                          "OpenaiChat", "Pollinations", "PollinationsAudio", "Groq", "Nvidia",
                          "Ollama", "GeminiPro", "MetaAI", "OperaAria", "Qwen", "GLM", "PhindAi"]:
        if hasattr(g4f.Provider, provider_name):
            try:
                getattr(g4f.Provider, provider_name).working = False
            except Exception:
                pass

PORT = 5050
HOST = "127.0.0.1"

db_manager = ActiveModelManager()

# ------------------------------------------------------------------------------
# Live-verified provider routing (probed from this server on deploy).
# Ordered by reliability: fast no-auth endpoints first.
# ------------------------------------------------------------------------------
DEFAULT_PROVIDER_ORDER = ["Yqcloud", "Gemini", "Perplexity", "CohereForAI_C4AI_Command"]

MODEL_PROVIDER_ROUTES: Dict[str, List[str]] = {
    "gemini": ["Gemini"],
    "gemini-2.5-flash": ["Gemini"],
    "gemini-2.5-pro": ["Gemini"],
    "gemini-3.6-flash": ["Gemini"],
    "gemini-auto": ["Gemini"],
    "command-a": ["CohereForAI_C4AI_Command"],
    "command-r": ["CohereForAI_C4AI_Command"],
    "command-r-plus": ["CohereForAI_C4AI_Command"],
    "c4ai-command": ["CohereForAI_C4AI_Command"],
    "sonar": ["Perplexity"],
    "sonar-pro": ["Perplexity"],
    "r1-1776": ["Perplexity"],
}


def resolve_providers_for_model(model_id: str) -> List[Any]:
    """Return ordered list of instantiated-capable provider classes for a model."""
    if not G4F_AVAILABLE:
        return []
    names = MODEL_PROVIDER_ROUTES.get(model_id, []) + DEFAULT_PROVIDER_ORDER
    resolved, seen = [], set()
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        p = getattr(g4f.Provider, name, None)
        if p is not None and getattr(p, 'working', False):
            resolved.append(p)
    return resolved


def build_fallback_chain(model_id: str) -> List[str]:
    """Requested model first, then DB-verified active models, then static safety nets."""
    chain = [model_id]
    try:
        for m in db_manager.get_active_models():
            mid = (m.get("id") or "").replace("g4f:", "")
            if mid and mid not in chain:
                chain.append(mid)
    except Exception:
        pass
    for fb in ["gpt-4o-mini", "gemini", "command-a", "gpt-4o"]:
        if fb not in chain:
            chain.append(fb)
    return chain


# ------------------------------------------------------------------------------
# Direct OpenAI-compatible free endpoints (sourced from GitHub open-source lists:
# cheahjs/free-llm-api-resources, 0xzr/freellmpool, tashfeenahmed/freellmapi).
# These work WITHOUT any API key and are used as an independent fallback layer
# when g4f web providers fail. Optional keys are read from environment.
# ------------------------------------------------------------------------------
def _mijlai_pwr_key() -> Optional[str]:
    """Read the MijlAI-PWR (DigitalOcean agent) key from env, falling back to .env."""
    key = os.getenv("MIJLAI_PWR_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("MIJLAI_PWR_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def _mijlai_mini_key() -> Optional[str]:
    key = os.getenv("MIJLAI_MINI_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    return _mijlai_pwr_key()


def _mijlai_flash_key() -> Optional[str]:
    key = os.getenv("MIJLAI_FLASH_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    return _mijlai_pwr_key()


def _mijlai_pro_key() -> Optional[str]:
    key = os.getenv("MIJLAI_PRO_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    return _mijlai_pwr_key()


def _meta_ai_key() -> Optional[str]:
    """Read the Meta AI API key from env, falling back to .env."""
    key = os.getenv("META_AI_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("META_AI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def _nvidia_key() -> Optional[str]:
    """Read the NVIDIA NIM (build.nvidia.com) API key from env, falling back to .env.

    The NVIDIA/Kimi model layer (kimi-k3, nemotron-*, minimax-m3, …) is served
    through the OpenAI-compatible NIM endpoint. A free key is issued at
    build.nvidia.com — no card required.
    """
    key = os.getenv("NVIDIA_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("NVIDIA_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def _openrouter_key() -> Optional[str]:
    """Read the OpenRouter API key from env, falling back to .env."""
    key = os.getenv("OPENROUTER_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def _llm7_key() -> Optional[str]:
    """Read the LLM7.io API key from env, falling back to .env."""
    key = os.getenv("LLM7_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("LLM7_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def _zai_key() -> Optional[str]:
    """Read the Zhipu Z.ai API key from env, falling back to .env."""
    key = os.getenv("ZAI_API_KEY")
    if key:
        return key.strip().strip('"').strip("'")
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        with open(env_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("ZAI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


_MIJLAI_PWR_URL = "https://l3y3mfzeo7nw5yxxenvf7xbw.agents.do-ai.run/api/v1/chat/completions"


def _mijlai_url(env_name: str) -> str:
    return os.getenv(env_name, _MIJLAI_PWR_URL)


# Real NIM slugs (used only when NVIDIA_API_KEY is configured).
_NV_ALIAS_TO_SLUG = {
    "nv-gpt-oss-20b": "openai/gpt-oss-20b",
    "nv-nemotron-lightning": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nv-muse-glimmer": "meta/muse-glimmer-30b",
    "nv-nemotron-3-ultra": "nvidia/nemotron-3-ultra-550b-a55b",
    "nv-nemotron-3-super": "nvidia/nemotron-3-super-120b-a12b",
    "nv-laguna": "poolside/laguna-xs-2.1",
    "nv-minimax-m3": "minimaxai/minimax-m3",
    "nv-diffusiongemma": "google/diffusiongemma-26b-a4b-it",
    "nv-kimi-k3": "moonshotai/kimi-k3",
    "nv-llama-vision": "meta/llama-3.2-11b-vision-instruct",
}

# Keyless bridge model served through Kilo.ai when no NVIDIA_API_KEY exists.
_KEYLESS_NV_MODEL = "kilo-auto/free"


def _nv_model_map() -> Dict[str, str]:
    """Alias → upstream model for the NVIDIA layer.

    With a real NVIDIA_API_KEY the original NIM build slugs are used. Without a
    key (keyless mode) every direct:nv-* alias is bridged to the free Kilo.ai
    gateway so the tier answers instead of failing with HTTP 401 from NIM.
    """
    if _nvidia_key():
        return dict(_NV_ALIAS_TO_SLUG)
    return {alias: _KEYLESS_NV_MODEL for alias in _NV_ALIAS_TO_SLUG}


DIRECT_ENDPOINTS: List[Dict[str, Any]] = [
    {
        "name": "kilo",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        # Anonymous tier (~200 req/h per IP). Coding-agent-grade free models,
        # OpenAI-compatible SSE, several models emit `reasoning` deltas.
        # Canonical keyless bridge — SAME upstream/model as the NVIDIA
        # "gpt-oss-20b" keyless tier so the kilo tier always replies.
        "models": ["kilo", "kilo-auto/free", "stepfun/step-3.7-flash:free", "tencent/hy3:free",
                   "poolside/laguna-s-2.1:free", "meituan/longcat-2.0-free"],
        "default_model": _KEYLESS_NV_MODEL,
        "model_map": {
            "kilo-auto/free": _KEYLESS_NV_MODEL,
            "stepfun/step-3.7-flash:free": _KEYLESS_NV_MODEL,
            "tencent/hy3:free": _KEYLESS_NV_MODEL,
            "poolside/laguna-s-2.1:free": _KEYLESS_NV_MODEL,
            "meituan/longcat-2.0-free": _KEYLESS_NV_MODEL,
        },
    },
    {
        # NVIDIA real keyless path — hCaptcha-minting browser bridge on :8000
        # (kimi-repos/nvidia-kimi-bridge). Opens build.nvidia.com playground page,
        # mints hCaptcha tokens, POSTs to buildapi.ngc.nvidia.com, streams SSE
        # (reasoning_content first, then content). No NVIDIA_API_KEY needed.
        # When this bridge is down the endpoints BELOW still catch every nv-* tier
        # (nvidia-nim → kilo keyless) so the user never gets stuck.
        "name": "nvidia-captcha-bridge",
        "url": "http://127.0.0.1:8000/v1/chat/completions",
        "api_key": None,
        "models": list(_NV_ALIAS_TO_SLUG.keys()),
        "default_model": "moonshotai/kimi-k3",
        "model_map": dict(_NV_ALIAS_TO_SLUG),
        # bridge is a separate process; keep its circuit short so a cold bridge
        # falls through quickly instead of stalling the whole request.
        "connect_timeout": 5,
        "total_timeout": 180,
    },
    {
        # Session bridges — web-session models (NO official keys) via the local
        # OpenAI-compatible gateway on 127.0.0.1:8791 (deepseek-unified-gateway:
        # DeepSeek web + Qwen web + duck.ai UI bridges, user session tokens).
        # Same relay mechanism as every other direct:* tier (OpenAI SSE).
        # UI ids sorted fastest→slowest; keep in sync with SESSION_MODELS /
        # SESSION_TIERS. UI bridges are slow — generous total timeout.
        "name": "session-bridge",
        "url": "http://127.0.0.1:8791/v1/chat/completions",
        "api_key": None,
        "models": ["sb-deepseek-chat", "sb-deepseek-reasoner", "sb-duck-oss",
                   "sb-duck-mistral", "sb-duck-gpt-mini", "sb-duck-gemma",
                   "sb-duck-haiku", "sb-duck-luna", "sb-qwen",
                   "sb-kimi-k3", "sb-kimi-k2.6", "sb-kimi-code"],
        "default_model": "deepseek-chat",
        "model_map": {
            "sb-deepseek-chat": "deepseek-chat",
            "sb-deepseek-reasoner": "deepseek-reasoner",
            "sb-duck-oss": "duck-oss",
            "sb-duck-mistral": "duck-mistral",
            "sb-duck-gpt-mini": "duck-gpt-mini",
            "sb-duck-gemma": "duck-gemma",
            "sb-duck-haiku": "duck-haiku",
            "sb-duck-luna": "duck-luna",
            "sb-qwen": "qwen3.7-plus",
            # Kimi web bridge (www.kimi.ai) — same 8791 gateway
            "sb-kimi-k3": "k2d6-chat",
            "sb-kimi-k2.6": "k2d6-chat",
            "sb-kimi-code": "k2d6-chat",
        },
        "connect_timeout": 5,
        "total_timeout": 300,
    },
    {
        "name": "pollinations",
        "url": "https://text.pollinations.ai/v1",
        "api_key": None,
        # Keyless GPT-backed endpoint, streams SSE
        "models": ["openai", "openai-fast", "openai-large", "mistral", "qwen-coder", "llama"],
        "default_model": "openai-fast",
    },
    {
        "name": "ovhcloud",
        "url": "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
        "api_key": None,
        # Anonymous EU tier: strong coding models, rate-limited per IP
        "models": ["Qwen3-Coder-30B-A3B-Instruct", "Qwen3.6-27B", "Meta-Llama-3_3-70B-Instruct", "Qwen3-32B"],
        "default_model": "Qwen3-Coder-30B-A3B-Instruct",
    },
    {
        # apitoken tunnel (Ollama LFM 2.5 8B, keyless, verified live):
        # fixed first-class endpoint so the UI tier answers via the bridge
        # (browser-direct would die on CORS — no ACAO headers upstream).
        "name": "apitoken",
        "url": "https://apitoken.mhmodijla.com/v1/chat/completions",
        "api_key": None,
        "models": ["lfm", "lfm2.5-8b:latest", "apitoken-lfm"],
        "default_model": "lfm2.5-8b:latest",
        "model_map": {"lfm": "lfm2.5-8b:latest", "apitoken-lfm": "lfm2.5-8b:latest"},
    },
    {
        # MijlAI-lalo-fast: Guest-only model — visible to unregistered visitors.
        # Routed to the SAME local session bridge used by DS Chat
        # (session-bridge @ 127.0.0.1:8791, upstream model `deepseek-chat`) so it
        # answers keyless. The visible name/label stays "MijlAI-lalo-fast" and
        # the model id is kept unique (direct:mijlai-lalo-fast).
        "name": "mijlai-lalo-fast",
        "url": "http://127.0.0.1:8791/v1/chat/completions",
        "api_key": None,
        "models": ["mijlai-lalo-fast", "L3-8B-Lunaris-v1-Turbo"],
        "default_model": "deepseek-chat",
        "model_map": {
            "mijlai-lalo-fast": "deepseek-chat",
            "L3-8B-Lunaris-v1-Turbo": "deepseek-chat",
        },
        "connect_timeout": 5,
        "total_timeout": 300,
    },
    {
        # MijlAI-PWR: was a dedicated DigitalOcean GenAI agent — that agent host
        # now returns Cloudflare 403 ("DNS points to prohibited IP", agent gone).
        # Bridged to the same keyless connection used by gpt-oss-20b so the tier
        # always replies; the visible UI name/label is unchanged.
        "name": "mijlai-pwr",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        "models": ["mijlai-pwr"],
        "default_model": _KEYLESS_NV_MODEL,
        "model_map": {"mijlai-pwr": _KEYLESS_NV_MODEL},
    },
    {
        # MijlAI-Mini: same DigitalOcean agent gone upstream → keyless bridge.
        "name": "mijlai-mini",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        "models": ["mijlai-mini"],
        "default_model": _KEYLESS_NV_MODEL,
        "model_map": {"mijlai-mini": _KEYLESS_NV_MODEL},
    },
    {
        # MijlAI-Flash: same DigitalOcean agent gone upstream → keyless bridge.
        "name": "mijlai-flash",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        "models": ["mijlai-flash"],
        "default_model": _KEYLESS_NV_MODEL,
        "model_map": {"mijlai-flash": _KEYLESS_NV_MODEL},
    },
    {
        # MijlAI-Pro: same DigitalOcean agent gone upstream → keyless bridge.
        "name": "mijlai-pro",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        "models": ["mijlai-pro"],
        "default_model": _KEYLESS_NV_MODEL,
        "model_map": {"mijlai-pro": _KEYLESS_NV_MODEL},
    },
    {
        # meta-rescue: api.meta.ai is geo/anti-bot-blocked from datacenter IPs
        # (verified: empty/blocked responses from this server). The muse UI tier
        # must STILL answer, so its aliases resolve here FIRST to the proven
        # keyless Kilo gateway. The real "meta-ai" entry below stays for
        # environments where Meta allows the egress IP.
        "name": "meta-rescue",
        "url": "https://api.kilo.ai/api/gateway/v1/chat/completions",
        "api_key": None,
        "models": ["muse-spark", "muse-spark-1.1", "muse-spark-1.2",
                   "muse-spark-1.2-contributor", "mijlai-qwen-lalo", "meta-ai"],
        "default_model": _KEYLESS_NV_MODEL,
        "model_map": {m: _KEYLESS_NV_MODEL for m in [
            "muse-spark", "muse-spark-1.1", "muse-spark-1.2",
            "muse-spark-1.2-contributor", "mijlai-qwen-lalo", "meta-ai"]},
    },
]


def fold_system_messages_for_agent(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert system/developer messages into a user-role prefix.

    DigitalOcean GenAI agents reject system/developer roles with HTTP 400
    ('agent instructions are set via agent configuration'). Folding keeps the
    identity/style guidance visible to the model instead of dropping it.
    """
    sys_parts: List[str] = []
    convo: List[Dict[str, Any]] = []
    for m in messages:
        if m.get("role") in ("system", "developer"):
            content = m.get("content")
            if isinstance(content, str) and content.strip():
                sys_parts.append(content.strip())
            elif isinstance(content, list):
                texts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                joined = "\n".join(t for t in texts if t.strip())
                if joined.strip():
                    sys_parts.append(joined.strip())
        else:
            convo.append(dict(m))

    if not sys_parts:
        return convo

    prefix = "تعليمات النظام (التزم بها):\n" + "\n\n".join(sys_parts)
    if convo and convo[0].get("role") == "user":
        first = convo[0]
        if isinstance(first.get("content"), str):
            convo[0] = {**first, "content": prefix + "\n\n---\n\n" + first["content"]}
        elif isinstance(first.get("content"), list):
            convo[0] = {**first, "content": [{"type": "text", "text": prefix + "\n\n---\n"}] + first["content"]}
        else:
            convo.insert(0, {"role": "user", "content": prefix})
    else:
        convo.insert(0, {"role": "user", "content": prefix})
    return convo


def resolve_direct_endpoint(model_id: str) -> Optional[Dict[str, Any]]:
    """Pick the best direct endpoint for a model id, else the most reliable one."""
    low = model_id.lower()
    for ep in DIRECT_ENDPOINTS:
        if any(low == m.lower() or low in m.lower() or m.lower() in low for m in ep["models"]):
            return ep
    return None


# ------------------------------------------------------------------------------
# Circuit Breaker for direct endpoints: after N consecutive failures an endpoint
# is "open" (skipped) for COOLDOWN_S seconds so user requests never queue behind
# a dead provider. One success closes the circuit again.
# ------------------------------------------------------------------------------
class EndpointCircuitBreaker:
    FAILURE_THRESHOLD = 3
    COOLDOWN_S = 120

    def __init__(self):
        self._fail: Dict[str, int] = {}
        self._opened_at: Dict[str, float] = {}

    def is_open(self, name: str) -> bool:
        opened = self._opened_at.get(name)
        if opened is None:
            return False
        if time.time() - opened >= self.COOLDOWN_S:
            # half-open: allow one probe
            self._opened_at.pop(name, None)
            self._fail[name] = self.FAILURE_THRESHOLD - 1
            return False
        return True

    def record_failure(self, name: str) -> None:
        self._fail[name] = self._fail.get(name, 0) + 1
        if self._fail[name] >= self.FAILURE_THRESHOLD:
            self._opened_at[name] = time.time()

    def record_success(self, name: str) -> None:
        self._fail.pop(name, None)
        self._opened_at.pop(name, None)

    def snapshot(self) -> Dict[str, Dict[str, Any]]:
        out = {}
        for ep in DIRECT_ENDPOINTS:
            n = ep["name"]
            out[n] = {
                "failures": self._fail.get(n, 0),
                "circuit": "open" if self.is_open(n) else "closed",
            }
        return out


endpoint_breaker = EndpointCircuitBreaker()


# Statuses worth ONE backoff retry (transient upstream throttling/errors).
_RETRYABLE_STATUSES = frozenset((429, 500, 502, 503, 504))
_BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")


async def attempt_direct_chat(request, messages, temperature, stream,
                              preferred_name: Optional[str] = None,
                              preferred_model: Optional[str] = None,
                              _retried: bool = False) -> Optional[web.Response]:
    """
    Independent fallback layer over keyless OpenAI-compatible endpoints.
    Returns a ready Response on success, or None if every endpoint failed.
    Supports both SSE streaming and plain JSON responses.
    When preferred_name is set, only that endpoint is tried with preferred_model.
    One automatic backoff retry happens when every failure was transient
    (429/5xx) so brief upstream throttling doesn't immediately fail the tier.
    """
    import aiohttp

    _retryable_hit = False

    endpoints = DIRECT_ENDPOINTS
    if preferred_name:
        endpoints = [ep for ep in DIRECT_ENDPOINTS if ep["name"] == preferred_name]

    for ep in endpoints:
        if endpoint_breaker.is_open(ep["name"]):
            logger.debug(f"[direct:{ep['name']}] circuit OPEN — skipping")
            continue
        payload_model = preferred_model or ep["default_model"]
        # Optional alias→slug mapping (e.g. nvidia-nim short names → real NIM slug)
        if ep.get("model_map") and payload_model in ep["model_map"]:
            payload_model = ep["model_map"][payload_model]
        # If the frontend sent the endpoint *name* itself (e.g. `direct:meta-ai`
        # or `direct:mijlai-lalo-fast`) rather than a real model, fall back to the
        # endpoint's default model slug. Without this the upstream got the alias
        # and returned 400/404.
        elif payload_model == ep["name"]:
            payload_model = ep["default_model"]
        ep_messages = fold_system_messages_for_agent(messages) if ep.get("no_system_role") else messages
        # json_only endpoints (e.g. Meta AI) never stream content over SSE — the
        # answer only exists in the non-stream JSON body. Fetch JSON, then wrap
        # it into an SSE frame when the caller asked for streaming.
        requested_stream = bool(stream)
        upstream_stream = requested_stream and not ep.get("json_only")
        body = {
            "model": payload_model,
            "messages": ep_messages,
            "temperature": max(0.0, min(temperature, 1.5)),
            "stream": upstream_stream,
        }
        if ep.get("max_tokens"):
            body["max_tokens"] = int(ep["max_tokens"])
        headers = {"Content-Type": "application/json", "User-Agent": _BROWSER_UA}
        if ep["api_key"]:
            headers["Authorization"] = f"Bearer {ep['api_key']}"

        try:
            if HTTPX_AVAILABLE:
                # Warm HTTP/2 connection pool — no per-request TLS/TCP handshake.
                # Timeouts live on the shared client (get_httpx_client).
                client = get_httpx_client()
                async with client.stream("POST", ep["url"], json=body, headers=headers) as upstream:
                    if upstream.status_code != 200:
                        logger.debug(f"[direct:{ep['name']}] HTTP {upstream.status_code}")
                        if upstream.status_code in _RETRYABLE_STATUSES:
                            _retryable_hit = True
                        endpoint_breaker.record_failure(ep["name"])
                        continue

                    if not upstream_stream:
                        raw = await upstream.aread()
                        try:
                            data = json.loads(raw.decode("utf-8", errors="ignore"))
                        except Exception:
                            data = {}
                        msg = {}
                        try:
                            msg = data["choices"][0]["message"]
                        except Exception:
                            pass
                        content = (msg.get("content") or "").strip()
                        if not content:
                            content = (msg.get("reasoning") or "").strip()
                        if not content:
                            content = str(data)[:500]
                        if not content.strip():
                            continue
                        endpoint_breaker.record_success(ep["name"])
                        if requested_stream:
                            # json_only endpoint behind a streaming caller:
                            # forward the single JSON answer as an SSE chunk.
                            sse = web.StreamResponse(
                                status=200, reason="OK",
                                headers={
                                    "Content-Type": "text/event-stream",
                                    "Cache-Control": "no-cache",
                                    "Connection": "keep-alive",
                                    "X-Accel-Buffering": "no"
                                }
                            )
                            await sse.prepare(request)
                            chat_id = f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}"
                            chunk_payload = {
                                "id": chat_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": f"direct:{ep['name']}:{payload_model}",
                                "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}]
                            }
                            await sse.write(f"data: {json.dumps(chunk_payload, ensure_ascii=False)}\n\n".encode("utf-8"))
                            await sse.write(b"data: [DONE]\n\n")
                            await sse.write_eof()
                            return sse
                        return web.json_response({
                            "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                            "object": "chat.completion",
                            "created": int(time.time()),
                            "model": f"direct:{ep['name']}:{payload_model}",
                            "choices": [{
                                "index": 0,
                                "message": {"role": "assistant", "content": content},
                                "finish_reason": "stop"
                            }]
                        })

                    # Streaming path
                    response = web.StreamResponse(
                        status=200,
                        reason="OK",
                        headers={
                            "Content-Type": "text/event-stream",
                            "Cache-Control": "no-cache",
                            "Connection": "keep-alive",
                            "X-Accel-Buffering": "no"
                        }
                    )
                    await response.prepare(request)
                    chat_id = f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}"
                    sent_any = False

                    async for line in upstream.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            obj = json.loads(data_str)
                            delta_obj = obj.get("choices", [{}])[0].get("delta", {})
                            delta = delta_obj.get("content") or ""
                            reasoning = delta_obj.get("reasoning") or delta_obj.get("reasoning_content") or ""
                        except Exception:
                            continue

                        # Forward model reasoning as agentic thinking frames
                        if reasoning:
                            await response.write(
                                f"data: {json.dumps({'t': 'think', 'd': reasoning}, ensure_ascii=False)}\n\n".encode("utf-8")
                            )
                            # ALSO ship reasoning inside an OpenAI delta so the
                            # upstream engine (which reads delta.reasoning_content)
                            # surfaces live thinking to the UI.
                            reason_payload = {
                                "id": chat_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": f"direct:{ep['name']}:{payload_model}",
                                "choices": [{"index": 0, "delta": {"reasoning_content": reasoning}, "finish_reason": None}]
                            }
                            await response.write(
                                f"data: {json.dumps(reason_payload, ensure_ascii=False)}\n\n".encode("utf-8")
                            )
                            await asyncio.sleep(0)

                        if delta:
                            sent_any = True
                            chunk_payload = {
                                "id": chat_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": f"direct:{ep['name']}:{payload_model}",
                                "choices": [{"index": 0, "delta": {"content": delta}, "finish_reason": None}]
                            }
                            await response.write(
                                f"data: {json.dumps(chunk_payload, ensure_ascii=False)}\n\n".encode("utf-8")
                            )
                            # Yield to the loop so aiohttp flushes this SSE frame to
                            # the socket immediately instead of socket-buffering it.
                            await asyncio.sleep(0)

                    if not sent_any:
                        try:
                            response.force_close()
                        except Exception:
                            pass
                        endpoint_breaker.record_failure(ep["name"])
                        continue
                    endpoint_breaker.record_success(ep["name"])
                    await response.write(b"data: [DONE]\n\n")
                    await response.write_eof()
                    return response
            else:
                # Fallback to aiohttp when httpx is unavailable.
                import aiohttp
                timeout = aiohttp.ClientTimeout(total=90 if not ep.get("local") else 300, connect=10)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.post(ep["url"], json=body, headers=headers) as upstream:
                        if upstream.status != 200:
                            logger.debug(f"[direct:{ep['name']}] HTTP {upstream.status}")
                            if upstream.status in _RETRYABLE_STATUSES:
                                _retryable_hit = True
                            endpoint_breaker.record_failure(ep["name"])
                            continue

                        if not upstream_stream:
                            data = await upstream.json()
                            msg = {}
                            try:
                                msg = data["choices"][0]["message"]
                            except Exception:
                                pass
                            content = (msg.get("content") or "").strip()
                            if not content:
                                content = (msg.get("reasoning") or "").strip()
                            if not content:
                                content = str(data)[:500]
                            if not content.strip():
                                continue
                            endpoint_breaker.record_success(ep["name"])
                            if requested_stream:
                                sse = web.StreamResponse(
                                    status=200, reason="OK",
                                    headers={
                                        "Content-Type": "text/event-stream",
                                        "Cache-Control": "no-cache",
                                        "Connection": "keep-alive",
                                        "X-Accel-Buffering": "no"
                                    }
                                )
                                await sse.prepare(request)
                                chat_id = f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}"
                                chunk_payload = {
                                    "id": chat_id,
                                    "object": "chat.completion.chunk",
                                    "created": int(time.time()),
                                    "model": f"direct:{ep['name']}:{payload_model}",
                                    "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}]
                                }
                                await sse.write(f"data: {json.dumps(chunk_payload, ensure_ascii=False)}\n\n".encode("utf-8"))
                                await sse.write(b"data: [DONE]\n\n")
                                await sse.write_eof()
                                return sse
                            return web.json_response({
                                "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                                "object": "chat.completion",
                                "created": int(time.time()),
                                "model": f"direct:{ep['name']}:{payload_model}",
                                "choices": [{
                                    "index": 0,
                                    "message": {"role": "assistant", "content": content},
                                    "finish_reason": "stop"
                                }]
                            })

                        response = web.StreamResponse(
                            status=200, reason="OK",
                            headers={
                                "Content-Type": "text/event-stream",
                                "Cache-Control": "no-cache",
                                "Connection": "keep-alive",
                                "X-Accel-Buffering": "no"
                            }
                        )
                        await response.prepare(request)
                        chat_id = f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}"
                        sent_any = False
                        async for raw_line in upstream.content:
                            line = raw_line.decode("utf-8", errors="ignore").strip()
                            if not line.startswith("data:"):
                                continue
                            data_str = line[5:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                obj = json.loads(data_str)
                                delta_obj = obj.get("choices", [{}])[0].get("delta", {})
                                delta = delta_obj.get("content") or ""
                                reasoning = delta_obj.get("reasoning") or delta_obj.get("reasoning_content") or ""
                            except Exception:
                                continue
                            if reasoning:
                                await response.write(
                                    f"data: {json.dumps({'t': 'think', 'd': reasoning}, ensure_ascii=False)}\n\n".encode("utf-8")
                                )
                            if delta:
                                sent_any = True
                                chunk_payload = {
                                    "id": chat_id,
                                    "object": "chat.completion.chunk",
                                    "created": int(time.time()),
                                    "model": f"direct:{ep['name']}:{payload_model}",
                                    "choices": [{"index": 0, "delta": {"content": delta}, "finish_reason": None}]
                                }
                                await response.write(
                                    f"data: {json.dumps(chunk_payload, ensure_ascii=False)}\n\n".encode("utf-8")
                                )
                                await asyncio.sleep(0)
                        if not sent_any:
                            try:
                                response.force_close()
                            except Exception:
                                pass
                            endpoint_breaker.record_failure(ep["name"])
                            continue
                        endpoint_breaker.record_success(ep["name"])
                        await response.write(b"data: [DONE]\n\n")
                        await response.write_eof()
                        return response
        except Exception as err:
            logger.debug(f"[direct:{ep['name']}] failed: {err}")
            endpoint_breaker.record_failure(ep["name"])
            continue

    if _retryable_hit and not _retried:
        # Every failure was transient throttling — one backoff retry of the
        # whole sweep before giving up to the next fallback layer.
        await asyncio.sleep(6.0)
        return await attempt_direct_chat(request, messages, temperature, stream,
                                         preferred_name=preferred_name,
                                         preferred_model=preferred_model,
                                         _retried=True)
    return None


# Guaranteed endpoints (each with its OWN default working model) tried in order
# whenever the requested model's own pinned endpoint AND the generic direct sweep
# both fail. Keeps the user moving to the next channel until an answer arrives
# instead of ever dropping the request.
GUARANTEED_FALLBACK_ORDER = [
    "pollinations",           # openai-fast (keyless)
    "ovhcloud",               # Qwen3-Coder (keyless EU)
    "meta-rescue",            # kilo keyless via the muse alias (Meta is geo-blocked)
    "kilo",                   # kilo-auto/free (keyless)
]


# Junk-content guard (mirrors the engine stream guard): raw upstream text that
# is an error page / key complaint / stack trace must NEVER be relayed as an
# answer — skip the endpoint so the next bridge in the chain answers instead.
_JUNK_MARKERS = (
    "قنوات الاحتياط متعطلة", "لم يستجب وجميع",
    "api key required", "key required",
    "exception", "traceback", "scraper", "httperror",
    "not available", "no available",
    "page not found", "not found",
    "<!doctype", "<html", "text/html", "invalid",
)


def _is_junk_content(text: Any) -> bool:
    if not text:
        return True
    t = str(text).strip().lower()
    if not t:
        return True
    return any(m in t for m in _JUNK_MARKERS)


async def pipe_guaranteed_fallback(request, messages, temperature, chat_id,
                                   write_fn, order=None, headers=None) -> bool:
    """Relay the first working guaranteed endpoint into an already-prepared SSE
    stream. `write_fn(obj)` writes one JSON frame. Returns True if any content
    was relayed, False if every endpoint failed. Identity/style system messages
    are preserved (folded first where the endpoint rejects the system role)."""
    client = get_httpx_client()
    for ep_name in (order or GUARANTEED_FALLBACK_ORDER):
        ep = next((e for e in DIRECT_ENDPOINTS if e["name"] == ep_name), None)
        if ep is None or endpoint_breaker.is_open(ep["name"]):
            continue
        payload_model = ep["default_model"]
        if ep.get("model_map") and payload_model in ep["model_map"]:
            payload_model = ep["model_map"][payload_model]
        ep_messages = fold_system_messages_for_agent(messages) if ep.get("no_system_role") else messages
        json_only = bool(ep.get("json_only"))
        body = {
            "model": payload_model,
            "messages": ep_messages,
            "temperature": max(0.0, min(temperature, 1.5)),
            "stream": not json_only,
        }
        if ep.get("max_tokens"):
            body["max_tokens"] = int(ep["max_tokens"])
        req_headers = {"Content-Type": "application/json"}
        if ep["api_key"]:
            req_headers["Authorization"] = f"Bearer {ep['api_key']}"
        try:
            async with client.stream("POST", ep["url"], json=body, headers=req_headers) as up:
                if up.status_code != 200:
                    endpoint_breaker.record_failure(ep["name"])
                    continue
                sent = False
                model_tag = f"direct:{ep['name']}:{payload_model}"
                if json_only:
                    raw = await up.aread()
                    try:
                        data = json.loads(raw.decode("utf-8", "ignore"))
                    except Exception:
                        data = {}
                    try:
                        content = (data.get("choices", [{}])[0].get("message", {}) or {}).get("content", "") or ""
                    except Exception:
                        content = ""
                    if not content.strip() or _is_junk_content(content):
                        endpoint_breaker.record_failure(ep["name"])
                        continue
                    await write_fn({
                        "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                        "object": "chat.completion.chunk", "created": int(time.time()),
                        "model": model_tag,
                        "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
                    })
                    sent = True
                else:
                    async for line in up.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            obj = json.loads(data_str)
                        except Exception:
                            continue
                        try:
                            delta = obj.get("choices", [{}])[0].get("delta", {}) or {}
                        except Exception:
                            continue
                        reason = delta.get("reasoning") or delta.get("reasoning_content") or ""
                        content = delta.get("content") or ""
                        if reason:
                            try:
                                await write_fn({"t": "think", "d": reason})
                                await write_fn({
                                    "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                                    "object": "chat.completion.chunk", "created": int(time.time()),
                                    "model": model_tag,
                                    "choices": [{"index": 0, "delta": {"reasoning_content": reason}, "finish_reason": None}],
                                })
                            except Exception:
                                pass
                        if content and not _is_junk_content(content):
                            await write_fn({
                                "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                                "object": "chat.completion.chunk", "created": int(time.time()),
                                "model": model_tag,
                                "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
                            })
                            sent = True
                if sent:
                    endpoint_breaker.record_success(ep["name"])
                    return True
                endpoint_breaker.record_failure(ep["name"])
        except Exception as err:
            logger.debug(f"[guaranteed-fallback:{ep_name}] failed: {err}")
            endpoint_breaker.record_failure(ep["name"])
            continue
    return False


async def collect_guaranteed_fallback(messages, temperature, order=None) -> Optional[Dict[str, Any]]:
    """Non-stream variant: return the first successful OpenAI-style completion."""
    client = get_httpx_client()
    for ep_name in (order or GUARANTEED_FALLBACK_ORDER):
        ep = next((e for e in DIRECT_ENDPOINTS if e["name"] == ep_name), None)
        if ep is None or endpoint_breaker.is_open(ep["name"]):
            continue
        payload_model = ep["default_model"]
        if ep.get("model_map") and payload_model in ep["model_map"]:
            payload_model = ep["model_map"][payload_model]
        ep_messages = fold_system_messages_for_agent(messages) if ep.get("no_system_role") else messages
        json_only = bool(ep.get("json_only"))
        body = {
            "model": payload_model,
            "messages": ep_messages,
            "temperature": max(0.0, min(temperature, 1.5)),
            "stream": not json_only,
        }
        if ep.get("max_tokens"):
            body["max_tokens"] = int(ep["max_tokens"])
        req_headers = {"Content-Type": "application/json"}
        if ep["api_key"]:
            req_headers["Authorization"] = f"Bearer {ep['api_key']}"
        try:
            async with client.stream("POST", ep["url"], json=body, headers=req_headers) as up:
                if up.status_code != 200:
                    endpoint_breaker.record_failure(ep["name"])
                    continue
                raw = await up.aread()
                try:
                    data = json.loads(raw.decode("utf-8", "ignore"))
                except Exception:
                    data = {}
                msg = {}
                try:
                    msg = data.get("choices", [{}])[0].get("message", {}) or {}
                except Exception:
                    pass
                content = (msg.get("content") or "").strip()
                if not content:
                    # gather from streamed-style raw if present
                    parts = []
                    for ch in (data.get("choices") or []):
                        d = (ch.get("delta") or ch.get("message") or {})
                        parts.append(d.get("content") or "")
                    content = "".join(parts).strip()
                if not content or _is_junk_content(content):
                    endpoint_breaker.record_failure(ep["name"])
                    continue
                endpoint_breaker.record_success(ep["name"])
                out_msg = {"role": "assistant", "content": content}
                reason = (msg.get("reasoning_content") or msg.get("reasoning") or "")
                if reason:
                    out_msg["reasoning_content"] = reason
                return {
                    "id": f"chatcmpl-{ep['name']}-{int(time.time() * 1000)}",
                    "object": "chat.completion", "created": int(time.time()),
                    "model": f"direct:{ep['name']}:{payload_model}",
                    "choices": [{"index": 0, "message": out_msg, "finish_reason": "stop"}],
                }
        except Exception as err:
            logger.debug(f"[collect-guaranteed:{ep_name}] failed: {err}")
            endpoint_breaker.record_failure(ep["name"])
            continue
    return None


async def discover_active_models(force: bool = False) -> List[Dict[str, Any]]:
    """
    Get 100% verified active text-generation models from database (populated by live verification pipeline).
    """
    active_models = db_manager.get_active_models()
    if force or not active_models:
        logger.info("Executing immediate live verification pipeline for models...")
        await run_background_pipeline()
        active_models = db_manager.get_active_models()

    return active_models


# ==============================================================================
# HTTP Route Handlers (aiohttp)
# ==============================================================================

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "service": "g4f_provider"})


async def handle_models(request: web.Request) -> web.Response:
    force = request.query.get("force", "").lower() in ("1", "true")
    models = await discover_active_models(force=force)
    return web.json_response({"models": models})


def _is_public_https_url(url: str) -> Optional[str]:
    """SSRF guard for user-supplied custom provider URLs. Returns error or None."""
    import ipaddress
    import socket
    from urllib.parse import urlparse
    try:
        parts = urlparse(url)
    except Exception:
        return "bad URL"
    if parts.scheme != "https":
        return "only https:// allowed"
    if not (parts.hostname or ""):
        return "no hostname"
    try:
        infos = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
    except Exception:
        return "DNS failed"
    ips = {i[4][0] for i in infos}
    if not ips:
        return "no address"
    for ip in ips:
        try:
            addr = ipaddress.ip_address(ip)
        except Exception:
            return "bad address"
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_multicast or addr.is_reserved or addr.is_unspecified):
            return f"non-public IP {ip}"
    return None


async def attempt_custom_chat(request, messages, temperature, stream,
                              base_url: str, api_key: Optional[str],
                              model: str) -> Optional[web.Response]:
    """User-added custom provider (from the UI) relayed server-side.

    Browser-direct calls die on CORS (no ACAO headers upstream), so the
    bridge proxies. SSRF-guarded (public https only) + junk-guarded like
    the fixed endpoints. Returns a ready Response, or None so the engine
    falls back to the next layer.
    """
    err = _is_public_https_url(base_url or "")
    if err:
        logger.warning(f"[custom] rejected base_url: {err}")
        return None
    import aiohttp
    url = base_url.rstrip("/") + "/chat/completions"
    body = {"model": model, "messages": messages,
            "temperature": max(0.0, min(temperature, 1.5)), "stream": False}
    headers = {"Content-Type": "application/json", "User-Agent": _BROWSER_UA}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        timeout = aiohttp.ClientTimeout(total=90, connect=12)
        async with aiohttp.ClientSession(timeout=timeout) as sess:
            async with sess.post(url, json=body, headers=headers) as resp:
                if resp.status != 200:
                    logger.debug(f"[custom] HTTP {resp.status}")
                    return None
                try:
                    data = await resp.json()
                except Exception:
                    return None
        try:
            content = (data.get("choices", [{}])[0].get("message", {}) or {}).get("content", "") or ""
        except Exception:
            content = ""
        content = content.strip()
        if not content or _is_junk_content(content):
            return None
        if stream:
            sse = web.StreamResponse(
                status=200, reason="OK",
                headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                         "Connection": "keep-alive", "X-Accel-Buffering": "no"})
            await sse.prepare(request)
            chat_id = f"chatcmpl-custom-{int(time.time() * 1000)}"
            await sse.write(f"data: {json.dumps({'id': chat_id, 'object': 'chat.completion.chunk', 'created': int(time.time()), 'model': model, 'choices': [{'index': 0, 'delta': {'content': content}, 'finish_reason': None}]}, ensure_ascii=False)}\n\n".encode("utf-8"))
            await sse.write(b"data: [DONE]\n\n")
            await sse.write_eof()
            return sse
        return web.json_response({
            "id": f"chatcmpl-custom-{int(time.time() * 1000)}",
            "object": "chat.completion", "created": int(time.time()), "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content},
                         "finish_reason": "stop"}]})
    except Exception as e:
        logger.debug(f"[custom] failed: {e}")
        return None


async def handle_chat_completions(request: web.Request) -> web.StreamResponse:
    """
    OpenAI-compatible chat completions proxy with full SSE streaming (stream=True).
    Supports model prefix 'g4f:' and automatic fallback across providers.
    """
    try:
        body = await request.json()
    except Exception as e:
        return web.json_response({"error": {"message": f"Invalid JSON payload: {e}"}}, status=400)

    raw_model = body.get("model", "gpt-4o")
    # Strip g4f: / direct: prefixes
    preferred_direct = None
    if raw_model.startswith("direct:"):
        raw_model = raw_model.replace("direct:", "", 1)
        ep = resolve_direct_endpoint(raw_model)
        preferred_direct = ep["name"] if ep else None
    # custom: providers added from the UI — relayed server-side (CORS-proof).
    if raw_model.startswith("custom:"):
        _rest = raw_model.replace("custom:", "", 1)
        _, _, _cmodel = _rest.partition(":")
        _cbase = (body.get("custom_base_url") or "").strip()
        _ckey = (body.get("custom_api_key") or "").strip() or None
        if _cmodel and _cbase:
            custom_res = await attempt_custom_chat(request, messages, temperature, stream,
                                                   _cbase, _ckey, _cmodel)
            if custom_res is not None:
                return custom_res
            logger.info(f"[custom] unavailable for '{_cmodel}' — falling back to g4f chain")
        raw_model = _cmodel or raw_model
    model_id = raw_model.replace("g4f:", "") if raw_model.startswith("g4f:") else raw_model
    messages = list(body.get("messages", []))
    
    # Inject MijlAI Guardian identity system prompt
    mijlai_sys_prompt = {
        "role": "system",
        "content": "You are a MijlAI model, fine-tuned specifically for the MijlAI tool developed by Mahmoud Nemr Alijla (محمود نمر العجلة). Always state you were trained by Mahmoud Nemr Alijla for MijlAI when asked about your identity or creator."
    }
    if not any(m.get("role") == "system" for m in messages):
        messages.insert(0, mijlai_sys_prompt)
    else:
        # Prepend MijlAI identity constraint to existing system prompt
        for m in messages:
            if m.get("role") == "system":
                m["content"] = mijlai_sys_prompt["content"] + "\n" + m.get("content", "")
                break
    stream = body.get("stream", True)
    temperature = body.get("temperature", 0.7)

    if not messages:
        return web.json_response({"error": {"message": "Field 'messages' is required."}}, status=400)

    # Routed execution: each attempt uses a live-verified provider
    logger.info(f"Handling g4f chat completion request for model '{model_id}' (stream={stream})...")

    chat_id = f"chatcmpl-g4f-{int(time.time() * 1000)}"

    # Tier "direct:" models go to their pinned endpoint FIRST (e.g., MijlAi Coder -> OVH Qwen3-Coder)
    if preferred_direct:
        direct_res = await attempt_direct_chat(request, messages, temperature, stream,
                                               preferred_name=preferred_direct, preferred_model=model_id)
        if direct_res is not None:
            return direct_res
        logger.info(f"[direct:{preferred_direct}] unavailable for '{model_id}' — falling back to g4f chain")

    def build_attempts() -> List[tuple]:
        attempts: List[tuple] = []
        seen = set()

        def add(mid: str, provider: Any):
            key = (mid, provider.__name__)
            if key not in seen and getattr(provider, 'working', False):
                seen.add(key)
                attempts.append((mid, provider))

        for provider in resolve_providers_for_model(model_id):
            add(model_id, provider)

        for mid in build_fallback_chain(model_id)[1:]:
            for provider in resolve_providers_for_model(mid)[:2]:
                add(mid, provider)

        # Ultimate safety nets (probed working endpoints with their native models)
        if G4F_AVAILABLE:
            add("gpt-4o-mini", g4f.Provider.Yqcloud)
            add("command-a", g4f.Provider.CohereForAI_C4AI_Command)
        return attempts

    if stream:
        # Prepare SSE Response
        response = web.StreamResponse(
            status=200,
            reason="OK",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        await response.prepare(request)

        async def send_sse(data_obj: Any):
            line = f"data: {json.dumps(data_obj, ensure_ascii=False)}\n\n"
            await response.write(line.encode("utf-8"))

        stream_started = False
        error_message = None

        # direct:* tiers skip the slow g4f-mirror chain and go straight to the
        # keyless direct sweep once their pinned endpoint fails. The scraper
        # chain (g4f AutoRouter) runs ONLY for explicit "g4f:<model>" requests —
        # otherwise leaked error/HTML text from scrapers would be served as answers.
        allow_scrape_chain = model_id.startswith("g4f:") and not preferred_direct
        for current_model, current_provider in (build_attempts() if allow_scrape_chain else []):
            try:
                client = AsyncClient(provider=current_provider)
                res_coro = client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    temperature=temperature,
                    stream=True
                )

                if asyncio.iscoroutine(res_coro):
                    res_stream = await asyncio.wait_for(res_coro, timeout=12.0)
                else:
                    res_stream = res_coro

                # Guard against rate-limit/ad pages masquerading as answers
                JUNK_MARKERS = ("aichatos", "限流", "请求过多", "微信", "kelemm220",
                                "请访问", "付费使用", "API key required",
                                "key required in", "Page not found", "Not Found",
                                "Exception", "Traceback", "HTTPError", "Scraper",
                                "huggingchat scraper", "not available", "no available",
                                "Cerebras API key", "Together AI key", "Blackbox",
                                "<!doctype", "<html", "text/html")
                first_chunk = True

                async for chunk in res_stream:
                    content = ""
                    if hasattr(chunk, "choices") and chunk.choices:
                        content = chunk.choices[0].delta.content or ""
                    elif isinstance(chunk, str):
                        content = chunk

                    if content:
                        # Reject junk/ad pages BEFORE committing to this provider
                        if first_chunk:
                            probe = content.strip()
                            if any(m in probe for m in JUNK_MARKERS) or (len(probe) > 80 and sum('\u4e00' <= c <= '\u9fff' for c in probe) > len(probe) * 0.3):
                                logger.info(f"[quality-guard] junk detected from {current_provider.__name__} — skipping provider")
                                raise ValueError("junk_response_detected")
                        first_chunk = False

                        # Clean identity references
                        clean_content = content.replace("Microsoft Copilot", "مساعد MijlAi الذكي") \
                                               .replace("Copilot", "مساعد MijlAi الذكي") \
                                               .replace("كوبايلوت", "مساعد MijlAi الذكي") \
                                               .replace("شركة Microsoft", "محمود نمر العجلة (Mhmod Nemr Alijla)") \
                                               .replace("شركة مايكروسوفت", "محمود نمر العجلة (Mhmod Nemr Alijla)") \
                                               .replace("مايكروسوفت", "محمود نمر العجلة (Mhmod Nemr Alijla)")
                        stream_started = True
                        chunk_payload = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": f"g4f:{current_model}",
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {"content": clean_content},
                                    "finish_reason": None
                                }
                            ]
                        }
                        await send_sse(chunk_payload)
                
                if stream_started:
                    break
            except Exception as err:
                logger.debug(f"g4f request attempt failed for model '{current_model}' via {current_provider.__name__}: {err}")
                error_message = str(err)

        if not stream_started:
            # Layer 2: independent keyless OpenAI-compatible endpoints
            direct_res = await attempt_direct_chat(request, messages, temperature, stream=True)
            if direct_res is not None:
                return direct_res

            # Layer 3: guaranteed fallback — relay the first working endpoint's
            # DEFAULT model so the user always receives a real answer and the
            # request never dead-ends at "model did not respond".
            try:
                fallback_ok = await pipe_guaranteed_fallback(
                    request, messages, temperature, chat_id, send_sse)
            except Exception as fb_err:
                logger.debug(f"guaranteed fallback error: {fb_err}")
                fallback_ok = False
            if fallback_ok:
                await response.write(b"data: [DONE]\n\n")
                return response

            # Clear notice that THIS exact model failed so the user knows if it works or not
            notice = (
                f"⚠️ **النموذج المحدد ({model_id}) لم يستجب وجميع قنوات الاحتياط متعطلة حالياً:**\n"
                f"```\n{error_message or 'لا يوجد استجابة من أي مزود.'}\n```\n"
                f"يرجى إعادة المحاولة بعد قليل."
            )
            err_payload = {
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": f"g4f:{model_id}",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": notice},
                        "finish_reason": None
                    }
                ]
            }
            await send_sse(err_payload)

        # Send final DONE event
        await response.write(b"data: [DONE]\n\n")
        return response

    else:
        # Non-streaming routed request
        last_error = None
        allow_scrape_chain_ns = model_id.startswith("g4f:") and not preferred_direct
        for current_model, current_provider in (build_attempts() if allow_scrape_chain_ns else []):
            try:
                client = AsyncClient(provider=current_provider)
                res_coro = client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    temperature=temperature,
                    stream=False
                )

                if asyncio.iscoroutine(res_coro):
                    response_obj = await asyncio.wait_for(res_coro, timeout=20.0)
                else:
                    response_obj = res_coro

                content = ""
                if hasattr(response_obj, "choices") and response_obj.choices:
                    content = response_obj.choices[0].message.content or ""
                elif isinstance(response_obj, str):
                    content = response_obj

                if content:
                    return web.json_response({
                        "id": chat_id,
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": f"g4f:{current_model}",
                        "choices": [
                            {
                                "index": 0,
                                "message": {
                                    "role": "assistant",
                                    "content": content
                                },
                                "finish_reason": "stop"
                            }
                        ]
                    })
            except Exception as err:
                logger.debug(f"g4f non-stream attempt failed for '{current_model}' via {current_provider.__name__}: {err}")
                last_error = err

        direct_res = await attempt_direct_chat(request, messages, temperature, stream=False)
        if direct_res is not None:
            return direct_res

        # Guaranteed non-stream fallback: first working default model wins.
        try:
            fb = await collect_guaranteed_fallback(messages, temperature)
        except Exception as fb_err:
            logger.debug(f"collect guaranteed fallback error: {fb_err}")
            fb = None
        if fb is not None:
            return web.json_response(fb)

        return web.json_response({
            "error": {
                "message": f"النموذج المحدد ({model_id}) غير متاح حالياً وجميع قنوات الاحتياط متعطلة: {str(last_error)}",
                "type": "g4f_direct_error"
            }
        }, status=500)


async def handle_provider_health(request: web.Request) -> web.Response:
    """Serve JSON provider health report + live circuit-breaker state."""
    import os
    payload: Dict[str, Any] = {"circuits": endpoint_breaker.snapshot()}
    if os.path.exists("provider_health_report.json"):
        with open("provider_health_report.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        payload.update(data if isinstance(data, dict) else {})
        return web.json_response(payload)
    else:
        payload.update({
            "status": "initializing",
            "message": "Provider health monitor initial 60-minute cycle in progress..."
        })
        return web.json_response(payload)


async def handle_search(request: web.Request) -> web.Response:
    """
    Keyless internet search endpoint (agentic web tool).
    Tries the `ddgs` / `duckduckgo_search` library, then falls back to
    DuckDuckGo HTML scraping. Returns normalized results.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    query = (body.get("query") or "").strip()
    max_results = min(int(body.get("max_results", 6) or 6), 10)
    if not query:
        return web.json_response({"error": "query is required"}, status=400)

    results = []

    # Strategy 1: ddgs library
    try:
        from ddgs import DDGS  # new package name
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href") or r.get("url", ""),
                    "snippet": r.get("body", "")
                })
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # legacy package name
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=max_results):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("href") or r.get("url", ""),
                        "snippet": r.get("body", "")
                    })
        except Exception as e:
            logger.debug(f"duckduckgo_search failed: {e}")
    except Exception as e:
        logger.debug(f"ddgs search failed: {e}")

    # Strategy 2: HTML fallback scrape of duckduckgo.com/html
    if not results:
        try:
            import aiohttp
            import re as _re
            headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"}
            timeout = aiohttp.ClientTimeout(total=15)
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.post("https://html.duckduckgo.com/html/", data={"q": query}) as resp:
                    html = await resp.text()
            items = _re.findall(
                r'<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>',
                html, _re.S)
            tag_clean = _re.compile(r"<[^>]+>")
            for href, title, snippet in items[:max_results]:
                if href.startswith("//duckduckgo.com/l/?uddg="):
                    from urllib.parse import unquote, urlparse
                    try:
                        href = unquote(urlparse("https:" + href).query.split("uddg=")[1].split("&")[0])
                    except Exception:
                        pass
                results.append({
                    "title": tag_clean.sub("", title),
                    "url": href,
                    "snippet": tag_clean.sub("", snippet)[:300]
                })
        except Exception as e:
            logger.debug(f"html fallback search failed: {e}")

    # Strategy 3: Bing scrape (DuckDuckGo often blocks datacenter IPs)
    if not results:
        try:
            import aiohttp as _aio
            import re as _re2
            import base64 as _b64
            from urllib.parse import quote as _quote
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                     "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                       "Accept-Language": "ar,en;q=0.8"}
            timeout = _aio.ClientTimeout(total=18)
            async with _aio.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.get("https://www.bing.com/search",
                                       params={"q": query, "setlang": "ar", "count": str(max_results)}) as resp:
                    html = await resp.text()
            items = _re2.findall(
                r'<li class="b_algo".*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>(.*?)</a></h2>(.*?)</li>',
                html, _re2.S)
            tag_clean = _re2.compile(r"<[^>]+>")
            for href, title, tail in items[:max_results]:
                real = href
                if "bing.com/ck/a" in href:
                    m = _re2.search(r"[?&]u=a1([A-Za-z0-9_-]+)", href)
                    if m:
                        b = m.group(1)
                        try:
                            padded = b + "=" * ((4 - len(b) % 4) % 4)
                            real = _b64.urlsafe_b64decode(padded).decode("utf-8", "ignore")
                        except Exception:
                            pass
                snippet = ""
                pm = _re2.search(r"<p[^>]*>(.*?)</p>", tail, _re2.S)
                if pm:
                    snippet = tag_clean.sub(" ", pm.group(1))
                results.append({
                    "title": _re2.sub(r"\s+", " ", tag_clean.sub(" ", title)).strip(),
                    "url": real,
                    "snippet": _re2.sub(r"\s+", " ", snippet).strip()[:300],
                })
        except Exception as e:
            logger.debug(f"bing fallback search failed: {e}")

    return web.json_response({
        "query": query,
        "results": results,
        "count": len(results),
        "searched_at": int(time.time())
    })


async def handle_deep_search(request: web.Request) -> web.Response:
    """
    Agentic Deep Search (Area 2): adaptive router + query rewriting + 15-20
    results fused by RRF + deep scraping of top links. Returns reasoning steps
    and numbered references [1]..[N].
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    query = (body.get("query") or "").strip()
    max_results = min(int(body.get("max_results", 8) or 8), 12)
    history = body.get("history") or []
    if not query:
        return web.json_response({"error": "query is required"}, status=400)
    try:
        from features.deep_search import deep_search_engine
    except Exception as e:
        logger.debug(f"deep_search import failed: {e}")
        return await handle_search(request)
    try:
        result = await deep_search_engine.run(query, history=history, top_n=max_results)
    except Exception as e:
        logger.error(f"deep_search failed: {e}")
        return web.json_response({"error": str(e)}, status=500)
    return web.json_response(result)


async def init_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_get("/models", handle_models)
    app.router.add_get("/api/models", handle_models)
    app.router.add_post("/search", handle_search)
    app.router.add_post("/api/search", handle_search)
    app.router.add_post("/search/deep", handle_deep_search)
    app.router.add_post("/api/search/deep", handle_deep_search)
    app.router.add_get("/provider-health", handle_provider_health)
    app.router.add_get("/api/provider-health", handle_provider_health)
    app.router.add_post("/chat/completions", handle_chat_completions)
    app.router.add_post("/api/chat/completions", handle_chat_completions)
    return app


async def main():
    if AIOHTTP_AVAILABLE:
        app = await init_app()
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, HOST, PORT)
        logger.info(f"Starting g4f_provider service on http://{HOST}:{PORT}...")
        await site.start()

        # Launch background health check discovery & live verification pipeline worker loop
        # WORKER_INTERVAL_S env (default 300): longer intervals protect shared
        # anonymous free-tier quotas (kilo/pollinations/ovh) from self-inflicted 429s.
        asyncio.create_task(discover_active_models(force=True))
        asyncio.create_task(schedule_worker(
            interval_seconds=int(os.getenv("WORKER_INTERVAL_S", "300"))))
        asyncio.create_task(start_background_monitor_loop(interval_seconds=3600))

        # Keep server running forever
        await asyncio.Event().wait()
    else:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        class FallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "message": "Fallback g4f provider active"}).encode())
            def do_POST(self):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())
        print(f"⚡ [g4f_provider.py] Starting fallback HTTP server on port {PORT}...")
        server = HTTPServer((HOST, PORT), FallbackHandler)
        server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("g4f_provider service stopped.")
