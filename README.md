# MijlAi — High-Performance, Zero-Latency Chat Architecture

A native-app quality, decoupled, and resilient chat application built with **FastAPI**, **Redis**, **Server-Sent Events (SSE)**, and **Vanilla JavaScript**. Engineered to provide zero-latency responses, instant tab-switch resumption, and a distraction-free "Invisible UX".

---

## 🏛️ Core Architectural Philosophy: "Decoupled, Predictive, & Invisible"

### 1. **Decoupled Engine**
- **Non-blocking input processing**: The `/api/chat/send` (or `/send`) endpoint accepts user prompts and returns a `task_id` in **< 10ms (TTFB)**.
- **Asynchronous LLM Workers**: Background tasks stream LLM completion chunks independently of HTTP request lifecycles.

### 2. **Predictive Pre-fetching & Offset Resumption**
- **Instant Preview Endpoint (`/api/chat/preview/{task_id}`)**: Enables the frontend to fetch the latest checkpointed text instantly when returning from background or refreshing.
- **Offset SSE Stream (`/api/chat/stream/{task_id}?offset=N`)**: Streams compact JSON payloads `{"t":"token","d":"text","o":12}`. On reconnect or background resume, the client requests tokens starting from offset `N`, eliminating token loss and duplicate text.

### 3. **Invisible UX Principles**
- **Zero Spinners / Loading Screens**: No intrusive loading indicators or typing animations. Text appears fluidly.
- **Pulse Token Cursor**: A subtle pulsing cursor appears on the last active token during generation without shifting page layout.
- **Smart Non-Intrusive Auto-Scroll**: Messages stick to the bottom only if the user is already at the bottom. If reading chat history, auto-scroll stays quiet.
- **Glassmorphic Fluid Design**: System font stack, auto dark/light OS mode detection, hardware-accelerated CSS transforms.

---

## 📁 Repository Structure

```
├── backend/
│   ├── app.py           # FastAPI application & SSE endpoints (/send, /stream/{task_id}, /preview/{task_id})
│   └── engine.py        # Asynchronous LLM generation engine with Redis & memory checkpointing
├── frontend/
│   ├── index.html       # Lightweight glassmorphic HTML UI with CSS variables & system fonts
│   ├── app.js           # Vanilla JS controller (<50KB): ChatController, SSEManager, UIManager, VisibilityObserver
│   ├── sw.js            # PWA Service Worker for offline support & static asset caching
│   └── manifest.json    # PWA configuration for "Add to Home Screen"
├── server.ts            # Full-stack Node/Express dev server proxying API routes & serving frontend assets
└── README.md            # Architecture & setup documentation
```

---

## 🚀 Quick Start & Setup Instructions

### 1. Requirements
- **Python**: 3.10+
- **Node.js**: 18+
- **Redis** *(Optional, automatically falls back to high-performance in-memory task store)*

### 2. Install Python Dependencies
```bash
pip install fastapi uvicorn redis pydantic
```

### 3. Run FastAPI Backend
```bash
python3 backend/app.py
```
*The FastAPI server will boot at `http://127.0.0.1:8000`.*

### 4. Run Node / Express Full-Stack Server
```bash
npm install
npm run dev
```
*Open `http://localhost:3000` in your browser to experience the live application.*

---

## 📡 API Endpoints Overview

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/chat/send` | `POST` | Accepts `{ "prompt": "..." }`, triggers background worker, returns `{ "task_id": "..." }` instantly. |
| `/api/chat/preview/{task_id}` | `GET` | Lightweight status check returning `{ "status": "generating", "full_text": "...", "token_count": 12 }`. |
| `/api/chat/stream/{task_id}` | `GET` | SSE endpoint supporting `?offset=N` or `Last-Event-ID` header for precise stream resumption. |
| `/api/health` | `GET` | System health check. |

---

## 🛡️ Resilience & Background Sync

1. **Tab Switch / Lock Screen Resilience**: When a user locks their phone or switches tabs, `VisibilityObserver` listens to `document.visibilityState`.
2. **Reconciliation**: Upon returning to foreground, `VisibilityObserver` calls `/api/chat/preview/{task_id}` to reconcile any missed text instantly.
3. **Seamless Re-Stream**: If generation is still in progress, `SSEManager` re-establishes the SSE stream starting from the last received token offset `N`.

---

## 🧩 Skills & Plugins System (v2.0)

نظام مهارات وإضافات مستورد البنية من مرجع Kimi الرسمي ومنفّذ بأدوات حقيقية:

- **Smart Message Queue**: إرسال رسائل متعددة أثناء التوليد — تدخل طابوراً وتُجاب بالتسلسل تلقائياً مع حالات مرئية (queued → thinking → streaming).
- **Skills Bar**: شريط سفلي أسفل حقل الكتابة للوصول السريع للمهارات المفعّلة + زر إدارة.
- **Skills Manager**: صفحة بتبويبات (مهارات/إضافات)، بحث، تفعيل/تعطيل، وشفافية العناصر غير المستوردة مع الأسباب.
- **Skill Builder** (`POST /api/skills/generate`): حوّل وصفاً موجزاً إلى مهارة كاملة قابلة للتنفيذ (مخطط JSON + حزمة تعليمات) — تُحفظ وتعمل فوراً.
- **Prompt-pack skills** تُحقن كتعليمات أسلوب عند الإرسال؛ **الإضافات** ترتبط بأدوات النظام الفعلية (بحث ويب، توليد صور، TTS، MCP).

انظر `CHANGELOG.md` للتفاصيل الكاملة و`tests/stress_test_results.json` لنتائج اختبار الضغط.
