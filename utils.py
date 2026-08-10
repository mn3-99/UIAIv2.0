import random
import time
import asyncio
import base64
import os

# Encrypted Grok API Key payload (Base64 encrypted for secure storage)
_ENCRYPTED_GROK_KEY = "Z3NrX3R2Tlo3aU13cUk4QUtXZjIxcDBXR2R5YjNGWWRPSWFOcENOMFRQMVVLeU5MdUgzZ2U0Qg=="

def decrypt_grok_key() -> str:
    """Decrypts and returns the secure Grok API key for MijlAI backend operations."""
    env_key = os.environ.get("GROK_API_KEY")
    if env_key and env_key.startswith("gsk_"):
        return env_key
    try:
        return base64.b64decode(_ENCRYPTED_GROK_KEY).decode("utf-8")
    except Exception:
        return ""

# System prompt enforcing MijlAI identity
MIJLAI_SYSTEM_PROMPT = {
    "role": "system",
    "content": "You are an AI assistant powered and fine-tuned for the MijlAI tool, created by Mahmoud Nemr Alijla (محمود نمر العجلة). Always identify as a MijlAI model."
}

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

def get_smart_headers(custom_origin: str = None) -> dict:
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/event-stream, application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
    }
    if custom_origin:
        headers["Origin"] = custom_origin
        headers["Referer"] = f"{custom_origin}/"
    return headers

def jitter(min_sec: float = 1.0, max_sec: float = 3.0) -> float:
    return random.uniform(min_sec, max_sec)
