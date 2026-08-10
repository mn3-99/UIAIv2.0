#!/usr/bin/env python3
"""
provider_monitor.py — System Health, Discovery & Reliability Monitor for AI Providers
Discovers providers, executes async health checks (8s max timeout, rate limited with random delays),
categorizes check statuses, calculates 24h success rates in SQLite, demotes providers with <70% success,
and outputs formatted JSON & Markdown reports every 60 minutes.
"""

import asyncio
import json
import logging
import os
import random
import sqlite3
import sys
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any, Set

try:
    import g4f
    from g4f.Provider import ProviderUtils
    from g4f.client import AsyncClient
    G4F_AVAILABLE = True
except ImportError:
    g4f = None
    ProviderUtils = None
    AsyncClient = None
    G4F_AVAILABLE = False

# Configure logging
logger = logging.getLogger("provider_monitor")
logger.setLevel(logging.INFO)

DB_FILE = "provider_health.db"
REPORT_JSON = "provider_health_report.json"
REPORT_MD = "provider_health_report.md"

# Categorized Status Enum
class CheckStatus(str, Enum):
    SUCCESS = "SUCCESS"
    AUTH_FAIL = "AUTH_FAIL"
    CAPTCHA_REQUIRED = "CAPTCHA_REQUIRED"
    RATE_LIMITED = "RATE_LIMITED"
    TIMEOUT = "TIMEOUT"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    UNKNOWN = "UNKNOWN"


def classify_error(exception_or_str: Any) -> CheckStatus:
    """Classify exception or error message into strict status categories."""
    err_str = str(exception_or_str).lower()

    if any(k in err_str for k in ["401", "403", "auth", "unauthorized", "forbidden", "api_key", "login"]):
        return CheckStatus.AUTH_FAIL
    if any(k in err_str for k in ["captcha", "cloudflare", "turnstile", "hcaptcha", "challenge"]):
        return CheckStatus.CAPTCHA_REQUIRED
    if any(k in err_str for k in ["429", "rate", "limit", "quota", "too_many_requests"]):
        return CheckStatus.RATE_LIMITED
    if any(k in err_str for k in ["timeout", "timed out", "exceeded"]):
        return CheckStatus.TIMEOUT
    if any(k in err_str for k in ["500", "502", "503", "504", "server error", "internal", "bad gateway"]):
        return CheckStatus.PROVIDER_ERROR
    if any(k in err_str for k in ["connect", "refused", "dns", "socket", "network", "reset"]):
        return CheckStatus.NETWORK_ERROR

    return CheckStatus.UNKNOWN


class ProviderMonitor:
    def __init__(self, db_path: str = DB_FILE):
        self.db_path = db_path
        self._init_db()
        self.known_providers_history: Set[str] = set()
        self._load_known_providers()

    def _get_db_connection(self) -> sqlite3.Connection:
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA user_version;")
            return conn
        except sqlite3.DatabaseError as e:
            logger.warning(f"⚠️ Corrupted SQLite DB detected ({self.db_path}): {e}. Resetting database...")
            if os.path.exists(self.db_path):
                try:
                    os.remove(self.db_path)
                except Exception:
                    pass
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            return conn

    def _init_db(self) -> None:
        """Initialize SQLite database tables for checks and rankings."""
        try:
            self._create_tables()
        except sqlite3.DatabaseError as e:
            logger.warning(f"⚠️ Error initializing monitor DB ({e}). Re-creating database...")
            if os.path.exists(self.db_path):
                try:
                    os.remove(self.db_path)
                except Exception:
                    pass
            self._create_tables()

    def _create_tables(self) -> None:
        with self._get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS provider_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider_name TEXT NOT NULL,
                model_id TEXT NOT NULL,
                status TEXT NOT NULL,
                latency_ms REAL NOT NULL,
                error_message TEXT,
                timestamp INTEGER NOT NULL
            )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_checks_ts ON provider_checks(timestamp);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_checks_prov ON provider_checks(provider_name);")
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS provider_rankings (
                provider_name TEXT PRIMARY KEY,
                model_id TEXT NOT NULL,
                total_checks_24h INTEGER,
                success_checks_24h INTEGER,
                success_rate_24h REAL,
                avg_latency_ms_24h REAL,
                is_demoted INTEGER,
                last_updated INTEGER
            )
            """)
            conn.commit()

    def _load_known_providers(self) -> None:
        """Load providers previously recorded in DB to track newly discovered ones."""
        with self._get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT provider_name FROM provider_checks")
            rows = cursor.fetchall()
            self.known_providers_history = {row["provider_name"] for row in rows}

    def record_check_result(
        self,
        provider_name: str,
        model_id: str,
        status: CheckStatus,
        latency_ms: float,
        error_message: Optional[str] = None
    ) -> None:
        """Save a single provider check result into SQLite."""
        now_ts = int(time.time())
        with self._get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO provider_checks (provider_name, model_id, status, latency_ms, error_message, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (provider_name, model_id, status.value, latency_ms, error_message, now_ts))
            conn.commit()

    def update_24h_rankings(self) -> List[Dict[str, Any]]:
        """
        Calculate 24-hour success rate for all providers, flag demoted providers (<70% success),
        and persist updated rankings in provider_rankings.
        """
        now_ts = int(time.time())
        cutoff_24h = now_ts - (24 * 3600)

        with self._get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    provider_name,
                    model_id,
                    COUNT(*) as total_checks,
                    SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success_checks,
                    AVG(CASE WHEN status = 'SUCCESS' THEN latency_ms ELSE latency_ms END) as avg_latency
                FROM provider_checks
                WHERE timestamp >= ?
                GROUP BY provider_name
            """, (cutoff_24h,))
            rows = cursor.fetchall()

            rankings = []
            for row in rows:
                p_name = row["provider_name"]
                m_id = row["model_id"]
                total = row["total_checks"]
                success = row["success_checks"]
                rate = (success / total * 100.0) if total > 0 else 0.0
                avg_lat = round(row["avg_latency"] or 0.0, 2)

                # Rule: Demote if 24h success rate < 70%
                is_demoted = 1 if rate < 70.0 else 0

                cursor.execute("""
                    INSERT INTO provider_rankings 
                        (provider_name, model_id, total_checks_24h, success_checks_24h, success_rate_24h, avg_latency_ms_24h, is_demoted, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(provider_name) DO UPDATE SET
                        model_id = excluded.model_id,
                        total_checks_24h = excluded.total_checks_24h,
                        success_checks_24h = excluded.success_checks_24h,
                        success_rate_24h = excluded.success_rate_24h,
                        avg_latency_ms_24h = excluded.avg_latency_ms_24h,
                        is_demoted = excluded.is_demoted,
                        last_updated = excluded.last_updated
                """, (p_name, m_id, total, success, rate, avg_lat, is_demoted, now_ts))

                rankings.append({
                    "provider_name": p_name,
                    "model_id": m_id,
                    "total_checks_24h": total,
                    "success_checks_24h": success,
                    "success_rate_24h": round(rate, 2),
                    "avg_latency_ms_24h": avg_lat,
                    "is_demoted": bool(is_demoted)
                })

            conn.commit()
            return rankings

    def discover_candidate_providers(self) -> List[Dict[str, Any]]:
        """
        Discover providers using official g4f ProviderUtils & g4f.Provider.__providers__
        and add custom candidates for latest models (Kimi K3, Claude 3.5/3.7, DeepSeek R1/V3, etc).
        """
        candidates = []

        # 1) Standard candidate models with AutoRouter
        models_to_check = [
            ("claude-3.7-sonnet", "Claude 3.7 Sonnet"),
            ("claude-3.5-sonnet", "Claude 3.5 Sonnet"),
            ("claude-3.5-haiku", "Claude 3.5 Haiku"),
            ("claude-3-opus", "Claude 3 Opus"),
            ("kimi-k3", "Kimi K3"),
            ("kimi-k1.5", "Kimi K1.5"),
            ("kimi", "Kimi Chat"),
            ("moonshot", "Moonshot AI"),
            ("gpt-4o", "GPT-4o"),
            ("gpt-4o-mini", "GPT-4o Mini"),
            ("gpt-4", "GPT-4"),
            ("o3-mini", "o3-mini"),
            ("deepseek-r1", "DeepSeek R1"),
            ("deepseek-v3", "DeepSeek V3"),
            ("qwen-2.5-coder-32b", "Qwen 2.5 Coder 32B")
        ]

        # Add primary AutoRouter candidates for active models
        for model_id, model_label in models_to_check:
            candidates.append({
                "provider_name": f"g4f-AutoRouter ({model_id})",
                "provider_obj": None,
                "model_id": model_id,
                "model_label": model_label
            })

        # 2) Extract active working g4f provider classes
        discovered_g4f_providers = []
        if hasattr(g4f.Provider, "__providers__"):
            for prov in g4f.Provider.__providers__:
                if hasattr(prov, "working") and prov.working and hasattr(prov, "__name__"):
                    discovered_g4f_providers.append(prov)

        # 3) Add specific provider + model candidate pairs
        for model_id, model_label in models_to_check[:5]:
            for prov in discovered_g4f_providers[:6]:
                candidates.append({
                    "provider_name": prov.__name__,
                    "provider_obj": prov,
                    "model_id": model_id,
                    "model_label": model_label
                })

        return candidates

    async def check_single_provider(
        self,
        candidate: Dict[str, Any],
        timeout: float = 8.0
    ) -> Tuple[CheckStatus, float, Optional[str]]:
        """
        Perform an async health check with a strict 8.0s timeout.
        Sends a simple text generation request and checks response.
        """
        start_time = time.time()
        provider_obj = candidate.get("provider_obj")
        model_id = candidate.get("model_id", "gpt-4o")

        try:
            async def call_generation():
                client = AsyncClient(provider=provider_obj) if provider_obj else AsyncClient()
                res_coro = client.chat.completions.create(
                    model=model_id,
                    messages=[{"role": "user", "content": "hi"}],
                    stream=True
                )
                if asyncio.iscoroutine(res_coro):
                    res_stream = await res_coro
                else:
                    res_stream = res_coro

                got_chunk = False
                async for chunk in res_stream:
                    content = ""
                    if hasattr(chunk, "choices") and chunk.choices:
                        content = chunk.choices[0].delta.content or ""
                    elif isinstance(chunk, str):
                        content = chunk
                    if content and len(content.strip()) > 0:
                        got_chunk = True
                        break

                if hasattr(res_stream, "aclose") and callable(res_stream.aclose):
                    try:
                        await res_stream.aclose()
                    except Exception:
                        pass
                return got_chunk

            res = await asyncio.wait_for(call_generation(), timeout=timeout)
            elapsed_ms = round((time.time() - start_time) * 1000, 2)

            if res:
                return CheckStatus.SUCCESS, elapsed_ms, None
            else:
                return CheckStatus.UNKNOWN, elapsed_ms, "Empty response generated"

        except asyncio.TimeoutError:
            elapsed_ms = round((time.time() - start_time) * 1000, 2)
            return CheckStatus.TIMEOUT, elapsed_ms, f"Timed out after {timeout}s limit"
        except Exception as e:
            elapsed_ms = round((time.time() - start_time) * 1000, 2)
            status = classify_error(e)
            return status, elapsed_ms, str(e)

    async def run_full_cycle(self) -> Dict[str, Any]:
        """
        Execute full monitoring cycle:
        1. Discover providers & candidates
        2. Async health check with rate limiting (max 1 req/s per provider & random delay 0.5-2.0s)
        3. Save to SQLite
        4. Update 24h rankings & demote <70% success
        5. Generate JSON & Markdown reports
        """
        logger.info("Starting provider health monitoring cycle...")
        candidates = self.discover_candidate_providers()

        cycle_results = []
        newly_discovered_working = []

        # Concurrent health check with semaphore and random delay (0.5s–2.0s) per task
        sem = asyncio.Semaphore(8)

        async def process_candidate(cand: Dict[str, Any]):
            async with sem:
                # Random jitter delay 0.5 - 2.0s per request to prevent server throttling
                await asyncio.sleep(random.uniform(0.5, 2.0))
                p_name = cand["provider_name"]
                m_id = cand["model_id"]

                status, latency_ms, err_msg = await self.check_single_provider(cand, timeout=8.0)
                self.record_check_result(p_name, m_id, status, latency_ms, err_msg)

                is_new = p_name not in self.known_providers_history
                if is_new and status == CheckStatus.SUCCESS:
                    newly_discovered_working.append({
                        "provider_name": p_name,
                        "model_id": m_id,
                        "latency_ms": latency_ms
                    })

                return {
                    "provider_name": p_name,
                    "model_id": m_id,
                    "status": status.value,
                    "latency_ms": latency_ms,
                    "error_message": err_msg
                }

        results = await asyncio.gather(*[process_candidate(c) for c in candidates], return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                cycle_results.append(r)

        # Update historical known set
        for cand in candidates:
            self.known_providers_history.add(cand["provider_name"])

        # Calculate 24h rankings & apply demotion rule
        rankings = self.update_24h_rankings()

        # Sort top stable providers (success rate desc, latency asc)
        stable_providers = sorted(
            [r for r in rankings if not r["is_demoted"] and r["success_checks_24h"] > 0],
            key=lambda x: (-x["success_rate_24h"], x["avg_latency_ms_24h"])
        )
        top_10_stable = stable_providers[:10]

        demoted_providers = [r for r in rankings if r["is_demoted"]]

        total_discovered = len(candidates)
        total_healthy = len([r for r in rankings if not r["is_demoted"]])
        total_demoted = len(demoted_providers)
        overall_health_rate = round((total_healthy / len(rankings) * 100.0) if rankings else 100.0, 1)

        report_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_providers_discovered": total_discovered,
                "total_healthy_providers": total_healthy,
                "total_demoted_providers": total_demoted,
                "overall_health_rate_percentage": overall_health_rate
            },
            "top_10_stable_providers": top_10_stable,
            "newly_discovered_working": newly_discovered_working,
            "demoted_providers": demoted_providers,
            "all_rankings_24h": rankings
        }

        # 1) Write JSON Report
        with open(REPORT_JSON, "w", encoding="utf-8") as f:
            json.dump(report_data, f, ensure_ascii=False, indent=2)

        # 2) Write Markdown Report
        md_content = self._generate_markdown_report(report_data)
        with open(REPORT_MD, "w", encoding="utf-8") as f:
            f.write(md_content)

        logger.info(f"Health cycle completed. Top 10 stable: {len(top_10_stable)}, Demoted: {total_demoted}. Reports saved.")
        return report_data

    def _generate_markdown_report(self, data: Dict[str, Any]) -> str:
        """Generate a formatted Arabic/English Markdown report."""
        summary = data["summary"]
        top_10 = data["top_10_stable_providers"]
        newly_working = data["newly_discovered_working"]
        demoted = data["demoted_providers"]
        ts = data["timestamp"]

        md = f"""# 📊 تقرير صحة واستقرار مزودي الذكاء الاصطناعي (AI Provider Health Report)

**تاريخ التحديث:** `{ts}`  
**حالة النظام العامة:**  
- 🔍 **إجمالي المزودين المكتشفين:** {summary['total_providers_discovered']}
- ✅ **المزودون المستقرون (نسبة نجاح ≥ 70%):** {summary['total_healthy_providers']}
- ⚠️ **المزودون المخفضون (< 70%):** {summary['total_demoted_providers']}
- 📈 **نسبة استقرار النظام العام:** `{summary['overall_health_rate_percentage']}%`

---

## 🏆 أفضل 10 مزودين استقرارًا (Top 10 Stable Providers)
| # | المزود | النموذج | نسبة النجاح (24 ساعة) | متوسط الاستجابة | الحالة |
|---|---|---|---|---|---|
"""
        if not top_10:
            md += "| - | لا يوجد مزودون مستقرون حالياً | - | 0% | - | ❌ | \n"
        else:
            for idx, item in enumerate(top_10, 1):
                md += f"| {idx} | **{item['provider_name']}** | `{item['model_id']}` | **{item['success_rate_24h']}%** | {item['avg_latency_ms_24h']}ms | 🟢 مستقر |\n"

        md += "\n---\n\n## ✨ المزودون الجدد المكتشفون الذين نجحوا (Newly Discovered Working Providers)\n"
        if not newly_working:
            md += "_لم يتم اكتشاف مزودين جدد غير معروفين في هذه الدورة._\n"
        else:
            for item in newly_working:
                md += f"- **{item['provider_name']}** (`{item['model_id']}`) — زمن الاستجابة: `{item['latency_ms']}ms` ✅\n"

        md += "\n---\n\n## ⚠️ المزودون الذين تم تخفيض ترتيبهم (< 70% Success Rate)\n"
        if not demoted:
            md += "🎉 _جميع المزودين المحصوين يحققون نسبة نجاح أعلى من 70%._\n"
        else:
            md += "| المزود | النموذج | نسبة النجاح | الفحوصات الناجحة / الإجمالي | حالة التخفيض |\n|---|---|---|---|---|\n"
            for item in demoted:
                md += f"| **{item['provider_name']}** | `{item['model_id']}` | **{item['success_rate_24h']}%** | {item['success_checks_24h']}/{item['total_checks_24h']} | 🔴 تم التخفيض |\n"

        md += """
---

## 🔍 ملخص عام لحالة النظام (General System Health Summary)
- يتم تنفيذ هذا الفحص تلقائياً كل **60 دقيقة**.
- يتم تطبيق مهلة زمنية حاسمة **8 ثوانٍ** لكل فحص لتفادي الجمود.
- المزودون الذين تقل نسبة نجاحهم عن **70%** في الـ 24 ساعة الماضية يتم تخفيض أولوية استخدامهم تلقائياً في طلبات التوليد لضمان أعلى اعتمادية واستجابة للمستخدمين.
"""
        return md


async def start_background_monitor_loop(interval_seconds: int = 3600) -> None:
    """Run the provider health monitoring loop every interval_seconds (default 60 mins)."""
    monitor = ProviderMonitor()
    logger.info(f"Starting Provider Monitor background task (Interval: {interval_seconds}s / 60 mins)...")
    while True:
        try:
            await monitor.run_full_cycle()
        except Exception as e:
            logger.error(f"Error in provider monitor loop execution: {e}", exc_info=True)
        
        await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    # Test single manual run when executed directly
    logging.basicConfig(level=logging.INFO)
    print("Testing ProviderMonitor single cycle execution...")
    mon = ProviderMonitor()
    asyncio.run(mon.run_full_cycle())
