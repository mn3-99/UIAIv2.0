import asyncio
import logging
import time
from typing import Dict, Any, Optional
try:
    import g4f
    from g4f.client import AsyncClient
    G4F_AVAILABLE = True
except ImportError:
    g4f = None
    AsyncClient = None
    G4F_AVAILABLE = False
from utils import jitter, get_smart_headers

logger = logging.getLogger("health_checker")

IMAGE_MODEL_KEYWORDS = ["dall-e", "flux", "sdxl", "stable-diffusion", "imagen", "midjourney"]

async def verify_model_live(model_info: Dict[str, Any], timeout: float = 12.0) -> bool:
    """
    إرسال طلب فحص حقيقي للتأكد من أن الموديل يعمل فعلياً (Live Ping Test).
    لا يمر أي موديل للواجهة إلا إذا اجتاز هذا الفحص بنجاح 100% (Status: SUCCESS).
    """
    model_id = model_info.get("id", "")
    if not model_id:
        return False

    # Skip known image models for text chat pinging
    if any(kw in model_id.lower() for kw in IMAGE_MODEL_KEYWORDS):
        logger.debug(f"ℹ️ [Live Verification SKIPPED] Model '{model_id}' is an image model")
        return False

    # Jitter delay to avoid server rate-limits during checks
    await asyncio.sleep(jitter(0.2, 0.8))

    try:
        client = AsyncClient()
        start_time = time.time()
        
        # Test generation with a minimal prompt
        res_coro = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": "hi"}],
            stream=True
        )

        if asyncio.iscoroutine(res_coro):
            res_stream = await asyncio.wait_for(res_coro, timeout=timeout)
        else:
            res_stream = res_coro

        received_token = False
        
        async def read_stream():
            nonlocal received_token
            try:
                if hasattr(res_stream, "__aiter__"):
                    async for chunk in res_stream:
                        content = ""
                        if hasattr(chunk, "choices") and chunk.choices:
                            content = chunk.choices[0].delta.content or ""
                        elif isinstance(chunk, str):
                            content = chunk

                        if content and len(content.strip()) > 0:
                            received_token = True
                            break
            except Exception as stream_err:
                logger.debug(f"[Live Verification Stream Exception] '{model_id}': {stream_err}")
            finally:
                if hasattr(res_stream, "aclose") and callable(res_stream.aclose):
                    try:
                        await res_stream.aclose()
                    except Exception:
                        pass

        await asyncio.wait_for(read_stream(), timeout=timeout)
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        if received_token:
            logger.info(f"✓ [Live Verification SUCCESS] Model '{model_id}' verified in {elapsed_ms}ms")
            return True
        else:
            logger.debug(f"❌ [Live Verification FAILED] Model '{model_id}' returned empty response")
            return False

    except asyncio.TimeoutError:
        logger.debug(f"❌ [Live Verification TIMEOUT] Model '{model_id}' timed out after {timeout}s")
        return False
    except Exception as e:
        err_msg = str(e).split('\n')[0] if str(e) else "Unknown error"
        logger.debug(f"❌ [Live Verification REJECTED] Model '{model_id}': {err_msg}")
        return False

