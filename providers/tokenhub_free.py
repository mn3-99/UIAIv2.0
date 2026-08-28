# providers/tokenhub_free.py
import asyncio
import json
import os
from pathlib import Path
from typing import AsyncGenerator
import httpx

class TokenHubFreeProvider:
    """
    Tencent TokenHub gateway (intl/Singapore) — OpenAI-compatible.
    Uses the account's FREE 1M-token quotas per model (verified 2026-08-25).
    API key is created server-side via tccli and stored chmod 600.
    """
    BASE_URL = "https://tokenhub-intl.tencentcloudmaas.com/v1"
    KEY_FILE = Path(__file__).parent / ".tokenhub_key"

    # Free-quota models available on this account (1M tokens each)
    FREE_MODELS = {
        "default": "deepseek-v4-flash",
        "reasoning": "deepseek-v4-pro-202606",
        "code": "kimi-k2.7-code",
        "fast": "glm-5-turbo",
        "hunyuan": "hy3",
        "glm": "glm-5.2",
        "kimi": "kimi-k2.6",
        "minimax": "minimax-m2.7",
    }

    def __init__(self):
        self._key = os.environ.get("TOKENHUB_API_KEY") or (
            self.KEY_FILE.read_text().strip() if self.KEY_FILE.exists() else ""
        )

    def resolve_model(self, model: str | None) -> str:
        if not model:
            return self.FREE_MODELS["default"]
        if model in self.FREE_MODELS.values():
            return model
        m = model.lower()
        if any(t in m for t in ("deepseek-r1", "o3", "reason")):
            return self.FREE_MODELS["reasoning"]
        if any(t in m for t in ("code", "coder", "qwen-2.5-coder")):
            return self.FREE_MODELS["code"]
        if any(t in m for t in ("hunyuan",)):
            return self.FREE_MODELS["hunyuan"]
        if any(t in m for t in ("kimi",)):
            return self.FREE_MODELS["kimi"]
        if any(t in m for t in ("minimax",)):
            return self.FREE_MODELS["minimax"]
        if any(t in m for t in ("glm",)):
            return self.FREE_MODELS["glm"]
        return self.FREE_MODELS["default"]

    async def chat_stream(self, messages: list, model: str = "deepseek-v4-flash") -> AsyncGenerator[str, None]:
        payload = {"model": self.resolve_model(model), "messages": messages, "stream": True}
        headers = {"Authorization": f"Bearer {self._key}"}
        try:
            timeout = httpx.Timeout(120.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(f"{self.BASE_URL}/chat/completions", json=payload, headers=headers)
                if resp.status_code == 402:
                    raise Exception("TokenHub free quota exhausted for all models")
                if resp.status_code != 200:
                    raise Exception(f"TokenHub HTTP {resp.status_code}: {resp.text[:200]}")
                ctype = resp.headers.get("content-type", "")
                if "event-stream" in ctype or resp.text.lstrip().startswith("data:"):
                    for line in resp.text.splitlines():
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
                            delta = obj.get("choices", [{}])[0].get("delta") or {}
                            chunk = delta.get("content") or ""
                        except Exception:
                            chunk = ""
                        if chunk:
                            yield chunk
                else:
                    obj = resp.json()
                    text = (obj["choices"][0]["message"].get("content") or "")
                    for word in text.split(" "):
                        yield word + " "
                        await asyncio.sleep(0)
        except Exception as e:
            raise Exception(f"TokenHub Provider Error: {str(e)}")
