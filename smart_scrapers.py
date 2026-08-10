import asyncio
import logging
import json
import urllib.request
import urllib.error
from typing import List, Dict, Any
try:
    import g4f
    G4F_AVAILABLE = True
except ImportError:
    g4f = None
    G4F_AVAILABLE = False
from utils import get_smart_headers, jitter

logger = logging.getLogger("smart_scrapers")

class SmartScraperEngine:
    """
    Engine for dynamically discovering candidate AI models from g4f modules and live sources.
    """
    
    def __init__(self):
        # Master candidate pool of models across Claude, Kimi, OpenAI, DeepSeek, Gemini, Qwen, etc.
        self.known_candidate_models = [
            # Claude Models
            {"id": "claude-3.7-sonnet", "name": "Claude 3.7 Sonnet (g4f Free)"},
            {"id": "claude-3.5-sonnet", "name": "Claude 3.5 Sonnet (g4f Free)"},
            {"id": "claude-3.5-haiku", "name": "Claude 3.5 Haiku (g4f Free)"},
            {"id": "claude-3-opus", "name": "Claude 3 Opus (g4f Free)"},
            {"id": "claude-3-sonnet", "name": "Claude 3 Sonnet (g4f Free)"},

            # Kimi & Moonshot Models
            {"id": "kimi-k3", "name": "Kimi K3 / Moonshot (g4f Free)"},
            {"id": "kimi-k1.5", "name": "Kimi K1.5 (g4f Free)"},
            {"id": "kimi", "name": "Kimi Chat (g4f Free)"},
            {"id": "moonshot", "name": "Moonshot AI (g4f Free)"},

            # OpenAI & Reasoning Models
            {"id": "gpt-4o", "name": "GPT-4o (g4f Free)"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini (g4f Free)"},
            {"id": "gpt-4", "name": "GPT-4 (g4f Free)"},
            {"id": "gpt-4.5", "name": "GPT-4.5 (g4f Free)"},
            {"id": "gpt-4.1", "name": "GPT-4.1 (g4f Free)"},
            {"id": "o1", "name": "o1 Reasoning (g4f Free)"},
            {"id": "o1-mini", "name": "o1-mini Reasoning (g4f Free)"},
            {"id": "o3-mini", "name": "o3-mini Reasoning (g4f Free)"},
            {"id": "o3-mini-high", "name": "o3-mini High (g4f Free)"},

            # DeepSeek Models
            {"id": "deepseek-r1", "name": "DeepSeek R1 Reasoning (g4f Free)"},
            {"id": "deepseek-v3", "name": "DeepSeek V3 (g4f Free)"},
            {"id": "deepseek-chat", "name": "DeepSeek Chat (g4f Free)"},
            {"id": "deepseek-coder", "name": "DeepSeek Coder (g4f Free)"},

            # Gemini Models via g4f
            {"id": "gemini-3.5-flash", "name": "Gemini 3.5 Flash (g4f Free)"},
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash (g4f Free)"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro (g4f Free)"},

            # Qwen, Llama & Open-Weight Models
            {"id": "qwen-2.5-coder-32b", "name": "Qwen 2.5 Coder 32B (g4f Free)"},
            {"id": "qwq-32b", "name": "QwQ 32B Reasoning (g4f Free)"},
            {"id": "llama-3.3-70b", "name": "Llama 3.3 70B (g4f Free)"},
            {"id": "grok-beta", "name": "Grok Beta (g4f Free)"},
            {"id": "grok-2", "name": "Grok 2 (g4f Free)"},
            {"id": "grok-3", "name": "Grok 3 (g4f Free)"},
            {"id": "command-r-plus", "name": "Command R+ (g4f Free)"},
            {"id": "aria", "name": "Aria (g4f Free)"},
            {"id": "sonar", "name": "Sonar Search (g4f Free)"}
        ]

    def _fetch_url_json(self, url: str) -> Any:
        headers = get_smart_headers()
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data_bytes = response.read()
            return json.loads(data_bytes.decode('utf-8'))

    async def discover_candidate_models(self, source_url: str = None) -> List[Dict[str, str]]:
        """Scrape / extract candidate models dynamically."""
        candidates = list(self.known_candidate_models)
        
        # Add dynamic models from g4f.models if available
        try:
            if hasattr(g4f.models, "_all_models") or hasattr(g4f.models, "ModelUtils"):
                model_names = getattr(g4f.models, "_all_models", [])
                for m_name in model_names:
                    if isinstance(m_name, str) and not any(c["id"] == m_name for c in candidates):
                        candidates.append({
                            "id": m_name,
                            "name": f"{m_name.capitalize()} (g4f Free)"
                        })
        except Exception as e:
            logger.debug(f"[Scraper Error] {e}")

        # If a source URL was passed, scrape URL using urllib asynchronously
        if source_url:
            try:
                await asyncio.sleep(jitter(0.2, 0.5))
                data = await asyncio.to_thread(self._fetch_url_json, source_url)
                if isinstance(data, list):
                    for item in data:
                        m_id = item.get("id") or item.get("name")
                        if m_id and not any(c["id"] == m_id for c in candidates):
                            candidates.append({
                                "id": m_id,
                                "name": item.get("name", f"{m_id} (g4f Free)")
                            })
            except Exception as e:
                logger.debug(f"[Scraper HTTP Error] {e}")

        return candidates
