import sys
import os
import asyncio
import json
import time
import uuid
import logging
import urllib.parse
from typing import Optional, Dict

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
from features.fact_extractor import extract_facts

db_mgr = ActiveModelManager()

logger = logging.getLogger("backend.app")
logging.basicConfig(level=logging.INFO)

app = None
ALLOWED_ORIGINS = [
    "https://ai.mhmodijla.com",
    "https://mijlai.com",
    "https://mijlai.duckdns.org",
    "https://www.mijlai.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
    "http://localhost:8084",
    "http://127.0.0.1:8084",
    "tauri://localhost"
]

if FASTAPI_AVAILABLE:
    app = FastAPI(
        title="Zero-Latency Chat Engine",
        description="High-Performance, Decoupled & Resilient SSE Chat Service",
        version="1.0.0"
    )

    # Enable CORS restricted to trusted domains and local development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=r"(https://.*\.run\.app|https://.*\.duckdns\.org)",
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )


async def run_send_message(prompt: str, messages: Optional[list], chat_id: Optional[str],
                           model: Optional[str], user_id: Optional[str], email: Optional[str],
                           system_prompt: Optional[str] = None):
    """Shared decoupled send logic used by both FastAPI routes and the fallback HTTP server."""
    user_prompt = prompt
    if not user_prompt and messages:
        last_msg = messages[-1]
        if isinstance(last_msg, dict):
            user_prompt = last_msg.get("content", "")
        elif isinstance(last_msg, str):
            user_prompt = last_msg

    if not user_prompt or not user_prompt.strip():
        return {"error": "Prompt cannot be empty"}, 400

    task_id = f"task_{uuid.uuid4().hex[:12]}"

    # Log user message & telemetry in database
    try:
        db_mgr.log_user_chat_activity(
            user_id=user_id or "guest",
            email=email or "guest@mijlai.com",
            chat_id=chat_id or "default_chat",
            prompt=user_prompt.strip(),
            model_id=model or "gpt-4o"
        )
    except Exception as log_err:
        logger.warning(f"Telemetry log failed: {log_err}")

    # Trigger background LLM generation without blocking response
    asyncio.create_task(
        llm_engine.generate_response_stream(
            task_id,
            user_prompt.strip(),
            model,
            messages,
            user_id=user_id or "guest",
            custom_system_prompt=system_prompt
        )
    )

    # Long-term memory: harvest durable facts from the user's message (free, heuristic)
    try:
        for fact in extract_facts(user_prompt):
            db_mgr.add_user_fact(user_id or "guest", fact, source_chat_id=chat_id)
    except Exception as fact_err:
        logger.debug(f"Fact extraction failed: {fact_err}")

    return {
        "task_id": task_id,
        "chat_id": chat_id or "default_chat",
        "status": "queued",
        "timestamp": time.time()
    }, 200


async def stream_task_events(task_id: str, offset: int = 0):
    """Shared SSE generator with offset resumption, used by FastAPI and fallback server.

    Frames:
      token → {"t":"token","d":"<delta>","o":N}          (answer text, offset-resumable)
      think → {"t":"think","d":"<full reasoning>","full":true}  (idempotent snapshots)
      done  → event: done {"t":"done","status":"...","o":N}
    """

    # 0. Catch up on accumulated reasoning (sent as one idempotent full snapshot).
    sent_think_len = 0
    thinking_so_far = await task_store.get_think_text(task_id)
    if thinking_so_far:
        sent_think_len = len(thinking_so_far)
        payload = json.dumps({"t": "think", "d": thinking_so_far, "full": True})
        yield f"id: t0\ndata: {payload}\n\n"

    # 1. Catch up on buffered/checkpointed tokens from offset
    current_offset = max(0, offset)
    existing_tokens = await task_store.get_tokens_from_offset(task_id, current_offset)
    for tok in existing_tokens:
        current_offset = tok["o"] + 1
        payload = json.dumps({"t": "token", "d": tok["d"], "o": current_offset})
        yield f"id: {current_offset}\ndata: {payload}\n\n"
        await asyncio.sleep(0.005)

    # 2. Stream live upcoming tokens
    # 300s guard so slow local models (big GGUF, first-token latency) can finish;
    # long idle gaps are also forgiven by resetting elapsed whenever tokens arrive.
    timeout_seconds = 300
    poll_interval = 0.03
    elapsed = 0.0

    while elapsed < timeout_seconds:
        preview = await task_store.get_task_preview(task_id)
        status = preview.get("status")

        # Fan out reasoning growth as idempotent full snapshots (no offset drift).
        thinking_now = preview.get("thinking") or ""
        if len(thinking_now) > sent_think_len:
            sent_think_len = len(thinking_now)
            payload = json.dumps({"t": "think", "d": thinking_now, "full": True})
            yield f"id: t{sent_think_len}\ndata: {payload}\n\n"

        new_tokens = await task_store.get_tokens_from_offset(task_id, current_offset)
        if new_tokens:
            for tok in new_tokens:
                current_offset = tok["o"] + 1
                payload = json.dumps({"t": "token", "d": tok["d"], "o": current_offset})
                yield f"id: {current_offset}\ndata: {payload}\n\n"
            elapsed = 0.0
        else:
            if status in ["completed", "failed", "aborted"]:
                done_payload = json.dumps({
                    "t": "done",
                    "status": status,
                    "o": current_offset,
                    "error": preview.get("error")
                })
                yield f"event: done\ndata: {done_payload}\n\n"
                return
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

    # Timeout guard: close stream cleanly
    yield f"event: done\ndata: {json.dumps({'t': 'done', 'status': 'timeout', 'o': current_offset})}\n\n"


if FASTAPI_AVAILABLE and app is not None:

    class SendMessageRequest(BaseModel):
        prompt: Optional[str] = None
        messages: Optional[list] = None
        chat_id: Optional[str] = None
        model: Optional[str] = None
        user_id: Optional[str] = None
        email: Optional[str] = None
        system_prompt: Optional[str] = None

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
    async def send_message(payload: SendMessageRequest):
        """Decoupled Endpoint: Returns task_id immediately (<10ms) while generation runs async."""
        data, status_code = await run_send_message(
            payload.prompt, payload.messages, payload.chat_id,
            payload.model, payload.user_id, payload.email,
            system_prompt=payload.system_prompt
        )
        if status_code != 200:
            raise HTTPException(status_code=status_code, detail=data.get("error", "Prompt cannot be empty"))
        return data

    class AbortRequest(BaseModel):
        task_id: Optional[str] = None
        jobId: Optional[str] = None
        chat_id: Optional[str] = None

    @app.post("/api/chat/abort")
    async def abort_generation(payload: AbortRequest):
        """True abort: cancel the asyncio generation task and mark it terminated."""
        tid = payload.task_id or payload.jobId
        if not tid:
            return JSONResponse(content={"status": "missing_task_id"}, status_code=400)
        ok = await llm_engine.abort_task(tid)
        return {"status": "aborted" if ok else "not_found", "task_id": tid}

    @app.get("/preview/{task_id}")
    @app.get("/api/chat/preview/{task_id}")
    async def get_preview(task_id: str):
        """Predictive Pre-fetching: instant lightweight text populate before streaming connects."""
        preview = await task_store.get_task_preview(task_id)
        return JSONResponse(content=preview)

    @app.get("/stream/{task_id}")
    @app.get("/api/chat/stream/{task_id}")
    async def stream_task_events_route(
        request: Request,
        task_id: str,
        offset: int = Query(0, ge=0, description="Token offset index to resume from"),
        last_event_id: Optional[str] = Header(None, alias="Last-Event-ID")
    ):
        """Optimized SSE Stream with Offset Resumption: data: {"t":"token","d":"text","o":12}"""
        start_offset = offset
        if last_event_id and last_event_id.isdigit():
            start_offset = max(start_offset, int(last_event_id))

        return StreamingResponse(
            stream_task_events(task_id, start_offset),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # ==========================================
    # Auth & Open WebUI Role Management Routes
    # ==========================================
    from security.auth import SecureAuthManager
    from fastapi import Depends, Security
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

    bearer_scheme = HTTPBearer(auto_error=False)

    async def require_admin(
        credentials: HTTPAuthorizationCredentials = Security(bearer_scheme)
    ) -> dict:
        """Guard for admin-only endpoints: valid JWT with role=admin is required."""
        if credentials is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        payload = SecureAuthManager.verify_token(credentials.credentials)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")
        return payload

    async def require_user(
        credentials: HTTPAuthorizationCredentials = Security(bearer_scheme)
    ) -> dict:
        """Guard for any authenticated endpoint (any role)."""
        if credentials is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        payload = SecureAuthManager.verify_token(credentials.credentials)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return payload

    @app.get("/api/auth/me")
    async def whoami(payload: dict = Depends(require_user)):
        return {"user_id": payload.get("user_id"), "role": payload.get("role"), "email": payload.get("email")}

    # ==========================================
    # Cloud Chat Sync Routes (JWT-protected, per-user)
    # ==========================================
    class SyncChatsRequest(BaseModel):
        chats: list
        since: Optional[float] = None

    @app.get("/api/sync/chats")
    async def sync_get_chats(since: float = 0, payload: dict = Depends(require_user)):
        chats = db_mgr.get_user_chats(payload["user_id"], since=since)
        return {"chats": chats, "server_time": time.time()}

    @app.post("/api/sync/chats")
    async def sync_push_chats(req: SyncChatsRequest, payload: dict = Depends(require_user)):
        if not isinstance(req.chats, list):
            raise HTTPException(status_code=400, detail="chats must be a list")
        if len(req.chats) > 500:
            raise HTTPException(status_code=413, detail="Too many chats in one batch (max 500)")
        result = db_mgr.upsert_user_chats(payload["user_id"], req.chats)
        pulled = db_mgr.get_user_chats(payload["user_id"], since=req.since or 0)
        return {"result": result, "chats": pulled, "server_time": time.time()}

    @app.delete("/api/sync/chats/{chat_id}")
    async def sync_delete_chat(chat_id: str, payload: dict = Depends(require_user)):
        ok = db_mgr.delete_user_chat(payload["user_id"], chat_id)
        return {"success": ok}

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

        # Generate JWT token
        token = SecureAuthManager.generate_token(res["id"], res.get("role", "user"), res.get("email", ""))
        res["token"] = token
        return res

    @app.post("/api/auth/register")
    async def register(req: RegisterRequest):
        req_info = {"ip": "127.0.0.1", "device": req.device_info or "Web App", "country": "Palestine"}
        res = db_mgr.register_user(req.username, req.email, req.password, req_info)
        if "error" in res:
            raise HTTPException(status_code=400, detail=res["error"])

        token = SecureAuthManager.generate_token(res["id"], res.get("role", "user"), res.get("email", ""))
        res["token"] = token
        return res

    # ==========================================
    # Admin Control Panel & Monitoring Routes (JWT-protected, admin role only)
    # ==========================================
    @app.get("/api/admin/users", dependencies=[Depends(require_admin)])
    async def get_users():
        return db_mgr.get_all_users()

    @app.post("/api/admin/user/role_or_status", dependencies=[Depends(require_admin)])
    async def update_user_role_status(req: UserRoleStatusRequest):
        success = db_mgr.update_user_status_or_role(req.user_id, req.role, req.status)
        return {"success": success}

    @app.delete("/api/admin/user/{user_id}", dependencies=[Depends(require_admin)])
    async def delete_user(user_id: str):
        success = db_mgr.delete_user(user_id)
        return {"success": success}

    @app.get("/api/admin/analytics", dependencies=[Depends(require_admin)])
    async def get_analytics():
        return db_mgr.get_telemetry_analytics()

    @app.get("/api/admin/chat_messages/{chat_id}", dependencies=[Depends(require_admin)])
    async def get_chat_messages(chat_id: str):
        return db_mgr.get_chat_messages(chat_id)

    class AdminSettingsRequest(BaseModel):
        settings: Dict[str, str]

    @app.get("/api/admin/settings", dependencies=[Depends(require_admin)])
    async def admin_get_settings():
        return {"settings": db_mgr.get_system_settings()}

    @app.post("/api/admin/settings", dependencies=[Depends(require_admin)])
    async def admin_set_settings(req: AdminSettingsRequest):
        # Only allow a known whitelist of keys to avoid settings-table abuse
        allowed = {"site_title", "default_system_prompt", "allow_registrations", "require_email_verification"}
        clean = {k: str(v)[:2000] for k, v in req.settings.items() if k in allowed}
        db_mgr.set_system_settings(clean)
        return {"success": True, "updated": sorted(clean.keys())}

    @app.post("/api/admin/db/vacuum", dependencies=[Depends(require_admin)])
    async def admin_db_vacuum():
        """Real SQLite maintenance: WAL checkpoint + VACUUM to reclaim space."""
        try:
            with db_mgr._get_conn() as conn:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
                conn.execute("VACUUM;")
            size_kb = round(os.path.exists(db_mgr.db_path) and os.path.getsize(db_mgr.db_path) / 1024 or 0, 1)
            return {"success": True, "size_kb": size_kb}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"فشلت الصيانة: {e}")

    # ==========================================
    # Long-term Memory Routes ("ماذا تعرف عني؟")
    # ==========================================
    @app.get("/api/memory/facts")
    async def get_my_facts(payload: dict = Depends(require_user)):
        facts = db_mgr.get_user_facts(payload["user_id"])
        return {"facts": facts}

    @app.delete("/api/memory/facts/{fact_id}")
    async def forget_fact(fact_id: int, payload: dict = Depends(require_user)):
        ok = db_mgr.delete_user_fact(payload["user_id"], fact_id)
        return {"success": ok}

    # ==========================================
    # RAG Knowledge Base (fastembed + sqlite-vec, fully local)
    # ==========================================
    class RagIngestRequest(BaseModel):
        name: str
        text: str

    class RagQueryRequest(BaseModel):
        query: str
        top_k: Optional[int] = 5

    @app.post("/api/rag/ingest")
    async def rag_ingest(req: RagIngestRequest, payload: dict = Depends(require_user)):
        import sqlite3 as _sq
        from features.rag_engine import ingest_document
        if not req.text or not req.text.strip():
            raise HTTPException(status_code=400, detail="text مطلوب")
        if len(req.text) > 2_000_000:
            raise HTTPException(status_code=413, detail="المستند كبير جداً (الحد 2MB نص)")
        try:
            with db_mgr._get_conn() as conn:
                count = ingest_document(conn, payload["user_id"], req.name or "مستند", req.text)
            return {"success": True, "chunks": count}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"فشل معالجة المستند: {e}")

    @app.post("/api/rag/query")
    async def rag_query(req: RagQueryRequest, payload: dict = Depends(require_user)):
        from features.rag_engine import query_knowledge
        try:
            with db_mgr._get_conn() as conn:
                results = query_knowledge(conn, payload["user_id"], req.query, top_k=min(req.top_k or 5, 10))
            return {"results": [{"text": t, "score": round(s, 4), "doc": d} for t, s, d in results]}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"فشل الاسترجاع: {e}")

    @app.get("/api/rag/documents")
    async def rag_list(payload: dict = Depends(require_user)):
        from features.rag_engine import list_documents
        with db_mgr._get_conn() as conn:
            return {"documents": list_documents(conn, payload["user_id"])}

    @app.delete("/api/rag/documents/{doc_id}")
    async def rag_delete(doc_id: int, payload: dict = Depends(require_user)):
        from features.rag_engine import delete_document
        with db_mgr._get_conn() as conn:
            ok = delete_document(conn, payload["user_id"], doc_id)
        return {"success": ok}

    # ==========================================
    # MCP Tools (Model Context Protocol — local stdio servers, no keys)
    # ==========================================
    class McpCallRequest(BaseModel):
        server: str
        tool: str
        arguments: Optional[dict] = None

    @app.get("/api/mcp/tools")
    async def mcp_tools(payload: dict = Depends(require_user)):
        from features.mcp_client import list_all_tools, DEFAULT_SERVERS
        tools = await list_all_tools()
        return {
            "tools": tools,
            "servers": [{"name": n, "desc": c["desc"], "available": True} for n, c in DEFAULT_SERVERS.items()]
        }

    @app.post("/api/mcp/call")
    async def mcp_call(req: McpCallRequest, payload: dict = Depends(require_user)):
        from features.mcp_client import execute_tool
        result = await execute_tool(req.server, req.tool, req.arguments or {})
        return result


# ==============================================================================
# Fallback HTTP Server (works without FastAPI/Pydantic, fully functional)
# ==============================================================================
def run_fallback_server():
    import threading
    from http.server import HTTPServer, BaseHTTPRequestHandler

    # Persistent event loop thread so background LLM tasks survive request handling
    _loop = asyncio.new_event_loop()
    threading.Thread(target=_loop.run_forever, daemon=True).start()

    def _run_coro(coro):
        return asyncio.run_coroutine_threadsafe(coro, _loop).result()

    async def handle_send_sync(body: dict):
        return await run_send_message(
            body.get("prompt"), body.get("messages"), body.get("chat_id"),
            body.get("model"), body.get("user_id"), body.get("email")
        )

    class FallbackHandler(BaseHTTPRequestHandler):
        def _send_json(self, obj, status=200):
            payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID")
            self.end_headers()

        def do_GET(self):
            path = urllib.parse.urlparse(self.path)
            if path.path in ("/health", "/api/health"):
                return self._send_json({"status": "ok", "timestamp": time.time(), "engine": "fallback"})
            if path.path.startswith("/preview/") or path.path.startswith("/api/chat/preview/"):
                task_id = path.path.rsplit("/", 1)[-1]
                preview = _run_coro(task_store.get_task_preview(task_id))
                return self._send_json(preview)
            if path.path.startswith("/stream/") or path.path.startswith("/api/chat/stream/"):
                task_id = path.path.rsplit("/", 1)[-1]
                query = urllib.parse.parse_qs(path.query)
                offset = int(query.get("offset", ["0"])[0]) or 0

                self.send_response(200)
                self.send_header("Content-type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-transform")
                self.send_header("Connection", "keep-alive")
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()

                async def run_stream():
                    async for event in stream_task_events(task_id, offset):
                        try:
                            self.wfile.write(event.encode("utf-8"))
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            break

                _run_coro(run_stream())
                return
            return self._send_json({"status": "ok", "message": "Fallback Python backend active"})

        def do_POST(self):
            path = urllib.parse.urlparse(self.path).path
            if path in ("/send", "/api/chat/send"):
                try:
                    length = int(self.headers.get("Content-Length", 0))
                    body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
                except Exception as e:
                    return self._send_json({"error": f"Invalid JSON payload: {e}"}, 400)
                data, status = _run_coro(handle_send_sync(body))
                return self._send_json(data, status)
            return self._send_json({"status": "ok"})

    print("⚡ [backend/app.py] Starting fallback HTTP server on 127.0.0.1:8088...")
    server = HTTPServer(("127.0.0.1", 8088), FallbackHandler)
    server.serve_forever()


if __name__ == "__main__":
    if FASTAPI_AVAILABLE and app is not None:
        import uvicorn
        # Bind to loopback only: FastAPI must be reachable exclusively through
        # the Express reverse proxy (which enforces rate limiting, CORS, auth).
        uvicorn.run(app, host="127.0.0.1", port=8088, reload=False)
    else:
        run_fallback_server()