import sys
import os
import asyncio
import json
import time
import uuid
import logging
from typing import Optional

backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(backend_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

try:
    from fastapi import FastAPI, BackgroundTasks, Request, Query, Header, HTTPException
    from fastapi.responses import StreamingResponse, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    print("⚠️ [backend/app.py] FastAPI/Pydantic not installed in Python environment. Using fallback http.server.")

from engine import task_store, llm_engine
from db_manager import ActiveModelManager

db_mgr = ActiveModelManager()

logger = logging.getLogger("backend.app")
logging.basicConfig(level=logging.INFO)

if FASTAPI_AVAILABLE:
    app = FastAPI(
        title="Zero-Latency Chat Engine",
        description="High-Performance, Decoupled & Resilient SSE Chat Service",
        version="1.0.0"
    )
else:
    app = None

# Enable CORS for all local & preview origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SendMessageRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[list] = None
    chat_id: Optional[str] = None
    model: Optional[str] = None
    user_id: Optional[str] = None
    email: Optional[str] = None

class LoginRequest(BaseModel):
    username_or_email: str
    password: str
    device_info: Optional[str] = "Web Browser"
    browser: Optional[str] = "Chrome"
    os: Optional[str] = "Android/Linux"
    country: Optional[str] = "Palestine"

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    device_info: Optional[str] = "Web Browser"

class UserRoleStatusRequest(BaseModel):
    user_id: str
    role: Optional[str] = None
    status: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    await task_store.initialize()
    logger.info("🚀 Zero-Latency FastAPI Backend Service initialized.")

@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time(), "engine": "zero-latency-fastapi"}

@app.post("/send")
@app.post("/api/chat/send")
async def send_message(payload: SendMessageRequest, background_tasks: BackgroundTasks):
    """
    Decoupled Endpoint: Returns task_id immediately (<10ms) while generation
    runs asynchronously in background worker.
    """
    user_prompt = payload.prompt
    if not user_prompt and payload.messages:
        last_msg = payload.messages[-1]
        if isinstance(last_msg, dict):
            user_prompt = last_msg.get("content", "")
        elif isinstance(last_msg, str):
            user_prompt = last_msg

    if not user_prompt or not user_prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    task_id = f"task_{uuid.uuid4().hex[:12]}"

    # Log user message & telemetry in database
    db_mgr.log_user_chat_activity(
        user_id=payload.user_id or "guest",
        email=payload.email or "guest@mijlai.com",
        chat_id=payload.chat_id or "default_chat",
        prompt=user_prompt.strip(),
        model_id=payload.model or "g4f:gpt-4o"
    )
    
    # Trigger background LLM generation without blocking response
    background_tasks.add_task(
        llm_engine.generate_response_stream,
        task_id,
        user_prompt.strip(),
        payload.model,
        payload.messages
    )

    return {
        "task_id": task_id,
        "chat_id": payload.chat_id or "default_chat",
        "status": "queued",
        "timestamp": time.time()
    }

@app.get("/preview/{task_id}")
@app.get("/api/chat/preview/{task_id}")
async def get_preview(task_id: str):
    """
    Predictive Pre-fetching Endpoint:
    Checks if task response/chunks exist and returns lightweight preview
    allowing instant UI text populate before streaming connects.
    """
    preview = await task_store.get_task_preview(task_id)
    return JSONResponse(content=preview)

@app.get("/stream/{task_id}")
@app.get("/api/chat/stream/{task_id}")
async def stream_task_events(
    request: Request,
    task_id: str,
    offset: int = Query(0, ge=0, description="Token offset index to resume from"),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID")
):
    """
    Optimized SSE Stream with Offset Resumption:
    Streams compact JSON tokens: `data: {"t": "token", "d": "text", "o": 12}`.
    Supports resuming from specific offset index without re-sending history.
    """
    # Parse last event ID if provided in SSE header
    start_offset = offset
    if last_event_id and last_event_id.isdigit():
        start_offset = max(start_offset, int(last_event_id))

    async def event_generator():
        current_offset = start_offset

        # 1. Catch up on buffered/checkpointed tokens from offset
        existing_tokens = await task_store.get_tokens_from_offset(task_id, current_offset)
        for tok in existing_tokens:
            if await request.is_disconnected():
                logger.info(f"Client disconnected during catchup on task {task_id}")
                return

            current_offset = tok["o"] + 1
            payload = json.dumps({"t": "token", "d": tok["d"], "o": current_offset})
            yield f"id: {current_offset}\ndata: {payload}\n\n"
            await asyncio.sleep(0.005) # Instant catch-up delivery

        # 2. Stream live upcoming tokens
        timeout_seconds = 30
        poll_interval = 0.05
        elapsed = 0.0

        while elapsed < timeout_seconds:
            if await request.is_disconnected():
                logger.info(f"Client disconnected during live stream on task {task_id}")
                return

            preview = await task_store.get_task_preview(task_id)
            status = preview.get("status")

            # Fetch new tokens produced since current_offset
            new_tokens = await task_store.get_tokens_from_offset(task_id, current_offset)
            if new_tokens:
                for tok in new_tokens:
                    current_offset = tok["o"] + 1
                    payload = json.dumps({"t": "token", "d": tok["d"], "o": current_offset})
                    yield f"id: {current_offset}\ndata: {payload}\n\n"
                elapsed = 0.0 # Reset timeout on active token stream
            else:
                if status in ["completed", "failed"]:
                    # Final completion event
                    done_payload = json.dumps({
                        "t": "done",
                        "status": status,
                        "o": current_offset,
                        "error": preview.get("error")
                    })
                    yield f"event: done\ndata: {done_payload}\n\n"
                    break
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no" # Disable Nginx buffering
        }
    )

# ==========================================
# Auth & Open WebUI Role Management Routes
# ==========================================
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    req_info = {
        "ip": "127.0.0.1",
        "device": req.device_info or "Web App",
        "browser": req.browser or "Chrome",
        "os": req.os or "Android",
        "country": req.country or "Palestine"
    }
    res = db_mgr.authenticate_user(req.username_or_email, req.password, req_info)
    if not res:
        raise HTTPException(status_code=401, detail="اسم المستخدم أو كلمة المرور غير صحيحة")
    if "error" in res:
        raise HTTPException(status_code=403, detail=res["error"])
    return res

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    req_info = {"ip": "127.0.0.1", "device": req.device_info or "Web App", "country": "Palestine"}
    res = db_mgr.register_user(req.username, req.email, req.password, req_info)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

# ==========================================
# Admin Control Panel & Monitoring Routes
# ==========================================
@app.get("/api/admin/users")
async def get_users():
    return db_mgr.get_all_users()

@app.post("/api/admin/user/role_or_status")
async def update_user_role_status(req: UserRoleStatusRequest):
    success = db_mgr.update_user_status_or_role(req.user_id, req.role, req.status)
    return {"success": success}

@app.delete("/api/admin/user/{user_id}")
async def delete_user(user_id: str):
    success = db_mgr.delete_user(user_id)
    return {"success": success}

@app.get("/api/admin/analytics")
async def get_analytics():
    return db_mgr.get_telemetry_analytics()

@app.get("/api/admin/chat_messages/{chat_id}")
async def get_chat_messages(chat_id: str):
    return db_mgr.get_chat_messages(chat_id)


if __name__ == "__main__":
    if FASTAPI_AVAILABLE and app is not None:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8088, reload=False)
    else:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        class FallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "message": "Fallback Python backend active"}).encode())
            def do_POST(self):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())
        print("⚡ [backend/app.py] Starting fallback HTTP server on port 8088...")
        server = HTTPServer(('0.0.0.0', 8088), FallbackHandler)
        server.serve_forever()
