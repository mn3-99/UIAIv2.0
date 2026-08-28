# providers/pollinations_free.py
import asyncio
import json
from urllib.parse import quote
from typing import AsyncGenerator
import httpx

class PollinationsFreeProvider:
    """
    Keyless OpenAI-compatible provider (verified active 2026-08).
    Anonymous tier: ~1 req / 3s, ~2 concurrent, no signup required.
    NOTE: aiohttp gets 402 (TLS/header fingerprint); httpx works.
    Streaming returns delta.content plus delta.reasoning — reasoning is skipped.
    """
    BASE_URL = "https://text.pollinations.ai/v1"
    IMAGE_URL = "https://image.pollinations.ai/prompt"

    def __init__(self):
        # IMPORTANT: do NOT set custom UA/headers — Pollinations WAF 402s
        # non-default fingerprints; stock httpx headers pass.
        self._headers = None

    def resolve_model(self, model: str | None) -> str:
        return "openai-fast"

    async def chat_stream(
        self,
        messages: list,
        model: str = "openai-fast"
    ) -> AsyncGenerator[str, None]:
        payload = {
            "model": self.resolve_model(model),
            "messages": messages,
            "stream": True
        }
        try:
            timeout = httpx.Timeout(90.0, connect=10.0)
            # NOTE: must be a REGULAR post() — client.stream()/aiohttp streaming
            # gets 402'd by their WAF; regular post returns the SSE body as text.
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(f"{self.BASE_URL}/chat/completions", json=payload)
                if resp.status_code == 429:
                    yield ""
                    return
                if resp.status_code != 200:
                    raise Exception(f"Pollinations HTTP {resp.status_code}: {resp.text[:200]}")
                if "text/event-stream" in resp.headers.get("content-type", "") or resp.text.lstrip().startswith("data:"):
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
                            choice = obj.get("choices", [{}])[0]
                            # Skip reasoning tokens; emit content only
                            chunk = (choice.get("delta") or {}).get("content") or ""
                        except Exception:
                            chunk = ""
                        if chunk:
                            yield chunk
                else:
                    try:
                        obj = resp.json()
                        text = obj["choices"][0]["message"]["content"] or ""
                    except Exception:
                        text = resp.text
                    for word in text.split(" "):
                        yield word + " "
                        await asyncio.sleep(0)
        except Exception as e:
            raise Exception(f"Pollinations Provider Error: {str(e)}")

    async def generate_image_url(self, prompt: str, width: int = 1024, height: int = 1024, model: str = "flux") -> str:
        return f"{self.IMAGE_URL}/{quote(prompt)}?width={width}&height={height}&nologo=true&model={model}"
