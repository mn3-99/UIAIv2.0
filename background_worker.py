import asyncio
import logging
from kimi_scraper import KimiK3ScraperEngine
from MijlAI_scraper import MijlAIScraperEngine
from smart_scrapers import SmartScraperEngine
from health_checker import verify_model_live
from db_manager import ActiveModelManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("background_worker")

async def run_scrape_and_verify_cycle():
    """
    الخدمة الخلفية المجدولة:
    1. كشط وتجربة Kimi K3 بكل الطرق المتاحة (Direct HTTP + g4f Provider).
    2. كشط وتجربة نماذج MijlAI المضمونة (MijlAI 3.5 Sonnet, MijlAI 3.7 Sonnet, MijlAI 3 Haiku).
    3. كشط وفحص النماذج المرشحة الأخرى (GPT-4o, DeepSeek, Gemini, etc.).
    4. تحديث قاعدة البيانات وقائمة الواجهة المتاحة حصراً (is_active = 1).
    """
    logger.info("🚀 [Worker] Starting dynamic discovery and live verification cycle...")
    
    verified_models = []
    seen_ids = set()

    # Core seed models to verify first
    core_candidates = [
        {"id": "grok-beta", "name": "MijlAI_grok-beta"},
        {"id": "gpt-4o", "name": "MijlAI_gpt-4o"},
        {"id": "o3-mini", "name": "MijlAI_o3-mini"},
        {"id": "gemini-2.5-flash", "name": "MijlAI_gemini-2.5-flash"},
        {"id": "gpt-4", "name": "MijlAI_gpt-4-turbo"},
        {"id": "deepseek-r1", "name": "MijlAI_deepseek-r1"},
        {"id": "MijlAI-3.5-sonnet", "name": "MijlAI_MijlAI-3.5-sonnet"}
    ]

    # First test core models
    for c in core_candidates:
        m_id = c["id"]
        norm_id = f"g4f:{m_id}"
        try:
            is_working = await verify_model_live(c, timeout=6.0)
            if is_working and norm_id not in seen_ids:
                seen_ids.add(norm_id)
                verified_models.append({
                    "model_id": norm_id,
                    "display_name": c["name"],
                    "method_used": "Verified"
                })
                logger.info(f"✅ [Core Model] Verified Live: {norm_id}")
        except Exception as err:
            logger.debug(f"[Core Model Test Error] {m_id}: {err}")

    # 2. كشط وتجربة نماذج MijlAI المضمونة
    try:
        MijlAI_engine = MijlAIScraperEngine()
        for c_model in MijlAI_engine.MijlAI_MODELS:
            res = await MijlAI_engine.verify_MijlAI_model(c_model)
            if res.get("status") == "SUCCESS" and res["model_id"] not in seen_ids:
                verified_models.append({
                    "model_id": res["model_id"],
                    "display_name": res["name"],
                    "method_used": res.get("method_used", "MijlAI_Scraped")
                })
                seen_ids.add(res["model_id"])
                logger.info(f"✅ [MijlAI] Model Verified: {res['model_id']}")
    except Exception as e:
        logger.error(f"[MijlAI Scraper Error] {e}")

    # 3. كشط وفحص النماذج المرشحة العامة بالتوازي
    try:
        scraper_engine = SmartScraperEngine()
        candidates = await scraper_engine.discover_candidate_models()
        logger.info(f"🔍 [Candidate Scraper] Testing {len(candidates)} candidate models live...")

        sem = asyncio.Semaphore(5)

        async def test_candidate(cand_info: dict):
            m_id = cand_info.get("id")
            if not m_id:
                return
            norm_id = f"g4f:{m_id}" if not m_id.startswith("g4f:") else m_id
            if norm_id in seen_ids:
                return

            async with sem:
                is_working = await verify_model_live(cand_info, timeout=8.0)
                if is_working and norm_id not in seen_ids:
                    seen_ids.add(norm_id)
                    verified_models.append({
                        "model_id": norm_id,
                        "display_name": cand_info.get("name", m_id),
                        "method_used": "g4f_live_ping"
                    })

        tasks = [test_candidate(c) for c in candidates]
        await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        logger.error(f"[Candidate Scraper Error] {e}")

    # 4. تحديث قاعدة البيانات وقائمة الواجهة المتاحة حصراً (ActiveModelManager)
    db = ActiveModelManager()
    db.sync_verified_models(verified_models)
    
    logger.info(f"🎉 [Worker Cycle Completed] Total Active Verified Models in UI: {len(verified_models)}")
    return verified_models


async def schedule_worker(interval_seconds: int = 300):
    """
    تشغيل الخدمة بشكل دائم للربط والتحديث التلقائي.
    """
    logger.info(f"🚀 [Worker Daemon] Scheduled loop running every {interval_seconds} seconds...")
    while True:
        try:
            await run_scrape_and_verify_cycle()
        except Exception as e:
            logger.error(f"[Background Worker Exception] {e}")
        
        await asyncio.sleep(interval_seconds)


async def run_background_pipeline():
    """Alias function for compatibility"""
    return await run_scrape_and_verify_cycle()


if __name__ == "__main__":
    print("Testing Background Pipeline execution...")
    asyncio.run(run_scrape_and_verify_cycle())
