"""
Long-term memory: heuristic fact extraction from user messages.
Zero-cost (no LLM calls) — pattern-based extraction of durable personal facts.
Runs after every completed chat turn; dedup happens in the DB layer.
"""
import re
from typing import List

# Arabic + English patterns that signal a durable personal fact
FACT_PATTERNS = [
    (re.compile(r"(?:اسمي|أنا اسمي|اسمى)\s+([\w\u0600-\u06FF]{2,30})", re.I), "اسم المستخدم: {0}"),
    (re.compile(r"my name is\s+([A-Za-z]{2,30})", re.I), "اسم المستخدم: {0}"),
    (re.compile(r"(?:أعمل|اشتغل|أنا موظف في|موظف في|أنا مهندس|مهندس)\s*(?:ك|في|ب)?\s*([\w\u0600-\u06FF ]{3,40})", re.I), "مهنة المستخدم: {0}"),
    (re.compile(r"i (?:work|am working) (?:as|at|in)\s+([A-Za-z ]{3,40})", re.I), "مهنة المستخدم: {0}"),
    (re.compile(r"(?:أسكن|أعيش في|من مدينة|من دولة)\s+([\w\u0600-\u06FF]{2,40})", re.I), "مكان المستخدم: {0}"),
    (re.compile(r"i (?:live|am based) in\s+([A-Za-z ]{2,40})", re.I), "مكان المستخدم: {0}"),
    (re.compile(r"(?:أدرس|طالب في|دراستي)\s+([\w\u0600-\u06FF ]{3,40})", re.I), "يدرس المستخدم: {0}"),
    (re.compile(r"i(?:'m| am) (?:studying|a student of)\s+([A-Za-z ]{3,40})", re.I), "يدرس المستخدم: {0}"),
    (re.compile(r"(?:أحب|أفضّل|أفضل)\s+([\w\u0600-\u06FF ]{3,40})", re.I), "يحب المستخدم: {0}"),
    (re.compile(r"i (?:like|love|prefer)\s+([A-Za-z ]{3,40})", re.I), "يحب المستخدم: {0}"),
    (re.compile(r"(?:مشروعي|أعمل على)\s+([\w\u0600-\u06FF ]{3,50})", re.I), "مشروع المستخدم: {0}"),
    (re.compile(r"my project is\s+([A-Za-z0-9 ]{3,50})", re.I), "مشروع المستخدم: {0}"),
]

MIN_FACT_LEN = 2


def extract_facts(text: str) -> List[str]:
    """Return deduplicated candidate facts from a single user message."""
    facts: List[str] = []
    if not text or len(text) > 4000:
        return facts
    for pattern, template in FACT_PATTERNS:
        for match in pattern.finditer(text):
            value = match.group(1).strip().rstrip('.,!؟').strip()
            if len(value) >= MIN_FACT_LEN and not value.lower() in ("انا", "أنا", "i", "in", "at", "as"):
                fact = template.format(value)
                if fact not in facts:
                    facts.append(fact)
    return facts[:5]
