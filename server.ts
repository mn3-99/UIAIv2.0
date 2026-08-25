import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { spawn, ChildProcess } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { handleModelsRequest } from './functions/api/models';
import { discoverLocalModels, getLocalModelEndpoint, getLocalModelInfo, resolveLocalTarget } from './functions/api/localModels';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT: number = Number(process.env.PORT) || 8082;
const G4F_SERVICE_URL = 'http://127.0.0.1:5050';

// ==========================================
// MijlAi identity enforcement (applied to every model, local or cloud)
// ==========================================
const MIJLAI_SYSTEM_PROMPT =
  'أنت MijlAi (مجلاي)، مساعد ذكاء اصطناعي متقدم وعالي السرعة، تم تطويره وامتلاكه حصرياً من منصة MijlAi (mijlai.duckdns.org).\n' +
  'مالك هذه الأداة ومطورها ومن قام بتدريبها وإعدادها هو: محمود نمر العجلة (Mhmod Nemr Alijla).\n' +
  'قوانين صارمة وملزمة لجميع الردود:\n' +
  '1. عند سؤالك "من أنت" أو "Who are you" أو عن هويتك أو صانعك أو مالكك، يجب أن تعرّف نفسك دائماً وبوضوح بأنك "MijlAi (مجلاي)"، نظام ذكاء اصطناعي صُمم وطُوّر خصيصاً لمنصة MijlAi، وأن مالك هذه الأداة ومطورها هو محمود نمر العجلة (Mhmod Nemr Alijla).\n' +
  '2. يُمنع منعاً باتاً وبشكل مطلق أن تذكر أو تُعزي تطويرك أو مصدرك إلى أي شركات أو جهات أو منظمات خارجية (مثل OpenAI أو ChatGPT أو Anthropic أو Claude أو Google أو Copilot أو Microsoft أو غيرها) بأي حال من الأحوال. كل العلامات والتطوير والملكية تعود حصراً لمنصة MijlAi ومطورها.\n' +
  '3. قدّم مساعدة سريعة ودقيقة وموجزة في البرمجة والكتابة والمهام العامة مع إخراج فوري ومباشر.\n' +
  '4. التزم حرفياً بهذه الأمثلة عند سؤالك عن هويتك أو صانعك:\n' +
  'س: من أنت؟\n' +
  'ج: أنا MijlAi (مجلاي)، مساعد ذكاء اصطناعي صُمم وطُوّر حصرياً لمنصة MijlAi (mijlai.duckdns.org).\n' +
  'س: من صممك أو من طورك أو من دربك أو من يملكك؟\n' +
  'ج: مالك هذه الأداة ومطورها ومدربها هو محمود نمر العجلة (Mhmod Nemr Alijla).\n' +
  'س: من أي شركة أنت؟ هل أنت من Google أو OpenAI؟\n' +
  'ج: لست من أي شركة خارجية إطلاقاً. أنا نموذج MijlAi الخاص بمنصة MijlAi، ولا علاقة لي بـ Google أو OpenAI أو غيرها.';

// Merge the enforced MijlAi system prompt with any client system messages and
// force it as the first, single system message so no model can be re-branded.
function injectMijlAiSystem(messages: any[]): any[] {
  const clientSystem = (messages || [])
    .filter((m) => m && m.role === 'system')
    .map((m) => m.content)
    .filter(Boolean)
    .join('\n\n');
  const merged = [MIJLAI_SYSTEM_PROMPT, clientSystem].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: merged },
    { role: 'user', content: 'من أنت؟' },
    { role: 'assistant', content: 'أنا MijlAi (مجلاي)، مساعد ذكاء اصطناعي صُمم وطُوّر حصرياً لمنصة MijlAi (mijlai.duckdns.org). مالك هذه الأداة ومطورها ومدربها هو محمود نمر العجلة (Mhmod Nemr Alijla).' },
    { role: 'user', content: 'من صممك أو من طورك أو من دربك؟' },
    { role: 'assistant', content: 'محمود نمر العجلة (Mhmod Nemr Alijla) هو مالك ومطور ومدرب منصة MijlAi. لست من Google أو OpenAI أو أي شركة أخرى.' },
    ...(messages || []).filter((m) => m && m.role !== 'system')
  ];
}

app.use(express.json({ limit: '200mb' }));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ==========================================
// CORS Middleware
// Allows the production domain, DuckDNS subdomains, local dev origins and the
// Tauri wrapper. SSE clients (EventSource) also need CORS when called cross-origin.
// ==========================================
const ALLOWED_ORIGINS = [
  'https://mijlai.duckdns.org',
  'https://ai.mhmodijla.com',
  'https://mijlai.com',
  'tauri://localhost'
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/.*\.duckdns\.org$/.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ==========================================
// Rate Limiter Middleware (Token Bucket / Sliding Window)
// ==========================================
interface RateLimiterRecord {
  tokens: number;
  lastRefill: number;
}

const rateLimitStore = new Map<string, RateLimiterRecord>();
const MAX_TOKENS_PER_WINDOW = 300; // 300 requests per 1 minute window (SSE reconnects + streaming)
const REFILL_WINDOW_MS = 60000;

// Long-lived streaming / polling endpoints must NOT consume tokens — a single
// chat turn opens several connections (send + SSE stream + status polls) and
// slow local models multiply them. Only charge for genuine request-heavy routes.
const RATE_LIMIT_EXEMPT_PREFIXES = [
  '/api/chat/stream',
  '/api/chat/status',
  '/api/chat/abort',
  '/api/ping',
  '/api/v1/chat/completions',
  '/api/chat/completions',
  '/api/models',
];

function rateLimiterMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === '/health' || req.path === '/api/health' || req.path.startsWith('/_vite')) {
    return next();
  }

  if (RATE_LIMIT_EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const now = Date.now();

  let record = rateLimitStore.get(clientIp);
  if (!record) {
    record = { tokens: MAX_TOKENS_PER_WINDOW, lastRefill: now };
    rateLimitStore.set(clientIp, record);
  }

  const timePassed = now - record.lastRefill;
  if (timePassed > REFILL_WINDOW_MS) {
    record.tokens = MAX_TOKENS_PER_WINDOW;
    record.lastRefill = now;
  }

  if (record.tokens > 0) {
    record.tokens -= 1;
    res.setHeader('X-RateLimit-Limit', MAX_TOKENS_PER_WINDOW);
    res.setHeader('X-RateLimit-Remaining', record.tokens);
    return next();
  } else {
    res.setHeader('Retry-After', Math.ceil((REFILL_WINDOW_MS - timePassed) / 1000));
    return res.status(429).json({
      error: 'عدد الطلبات كبير جداً، يرجى الانتظار قليلاً قبل المحاولة مجدداً (Rate limit exceeded).',
      status: 429
    });
  }
}

app.use('/api/', rateLimiterMiddleware);

// ==========================================
// Process Management: g4f_provider.py Service
// ==========================================
let g4fProcess: ChildProcess | null = null;
let isSpawningG4F = false;

let fastApiProcess: ChildProcess | null = null;
let isSpawningFastApi = false;

function ensureFastApiService() {
  if (isSpawningFastApi) return;

  fetch('http://127.0.0.1:8088/health')
    .then(res => {
      if (!res.ok) throw new Error('FastAPI health check failed');
    })
    .catch(() => {
      isSpawningFastApi = true;
      console.log('⚡ Spawning FastAPI backend/app.py service on port 8088...');

      const env = {
        ...process.env,
        PATH: `/root/.local/bin:${process.env.PATH || ''}`
      };

      fastApiProcess = spawn('python3', ['./backend/app.py'], {
        env,
        stdio: ['ignore', 'inherit', 'inherit']
      });

      fastApiProcess.on('error', (err) => {
        console.error('❌ Failed to start FastAPI backend/app.py:', err);
        isSpawningFastApi = false;
      });

      fastApiProcess.on('exit', (code) => {
        console.warn(`⚠️ FastAPI backend/app.py exited with code ${code}. Re-spawning in 3s...`);
        isSpawningFastApi = false;
        setTimeout(ensureFastApiService, 3000);
      });

      setTimeout(() => {
        isSpawningFastApi = false;
      }, 5000);
    });
}

function ensureG4FProviderService() {
  if (isSpawningG4F) return;

  fetch(`${G4F_SERVICE_URL}/health`)
    .then(res => {
      if (!res.ok) throw new Error('g4f health check failed');
    })
    .catch(() => {
      isSpawningG4F = true;
      console.log('🚀 Spawning g4f_provider.py Python service on port 5050...');

      const env = {
        ...process.env,
        PATH: `/root/.local/bin:${process.env.PATH || ''}`
      };

      g4fProcess = spawn('python3', ['./g4f_provider.py'], {
        env,
        stdio: ['ignore', 'inherit', 'inherit']
      });

      g4fProcess.on('error', (err) => {
        console.error('❌ Failed to start g4f_provider.py:', err);
        isSpawningG4F = false;
      });

      g4fProcess.on('exit', (code) => {
        console.warn(`⚠️ g4f_provider.py exited with code ${code}. Re-spawning in 3s...`);
        isSpawningG4F = false;
        setTimeout(ensureG4FProviderService, 3000);
      });

      setTimeout(() => {
        isSpawningG4F = false;
      }, 5000);
    });
}

// Initial check / spawn
ensureG4FProviderService();
ensureFastApiService();

// Initialize Gemini Client lazily or safely
function getGeminiClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير متوفر. يُرجى ضبط المفتاح في الإعدادات أو البيئة.');
  }
  return new GoogleGenAI({ apiKey });
}

// ==========================================
// Background Generation Job Queue & Memory Store
// ==========================================
interface BackgroundJobListenerPayload {
  type: 'chunk' | 'think' | 'done' | 'error';
  text?: string;
  error?: string;
  fullText?: string;
  thinkText?: string;
}

interface BackgroundJob {
  jobId: string;
  chatId: string;
  messageId?: string;
  status: 'generating' | 'completed' | 'failed' | 'aborted';
  fullText: string;
  chunks: string[];
  thinkText: string;
  thinkChunks: string[];
  thinkStartedAt?: number;
  thinkEndedAt?: number;
  // State machine for <think>...</think> tag parsing across chunk boundaries
  _inThinkBlock: boolean;
  _thinkCarry: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  providerId: string;
  listeners: Set<(event: BackgroundJobListenerPayload) => void>;
  abortController: AbortController;
}

const activeJobs = new Map<string, BackgroundJob>();

// ==========================================
// Agentic Thinking Extractor
// Routes reasoning output (<think> tags or delta.reasoning_content fields)
// into job.thinkText while returning only the visible answer delta.
// ==========================================
function processAssistantDelta(job: BackgroundJob, deltaObj: any, rawContent: string | null): { visibleDelta: string } {
  let visibleDelta = '';

  const pushThink = (text: string) => {
    if (!text) return;
    if (!job.thinkStartedAt) job.thinkStartedAt = Date.now();
    job.thinkText += text;
    job.thinkChunks.push(text);
  };

  // 1) Structured reasoning fields (OpenRouter/DeepSeek/Pollinations style)
  const reasoningField = deltaObj?.delta?.reasoning_content ?? deltaObj?.delta?.reasoning ?? deltaObj?.reasoning_content ?? deltaObj?.reasoning;
  if (typeof reasoningField === 'string' && reasoningField && !job._inThinkBlock) {
    pushThink(reasoningField);
  }

  // 2) Inline <think>...</think> blocks inside content stream
  if (rawContent) {
    let buffer = (job._thinkCarry || '') + rawContent;
    job._thinkCarry = '';

    // Keep a small tail in carry to avoid splitting a tag across chunks
    while (buffer.length > 0) {
      if (job._inThinkBlock) {
        const endIdx = buffer.indexOf('</think>');
        if (endIdx === -1) {
          // Hold back a tail that might contain a partial "</think>"
          const flushLen = Math.max(0, buffer.length - 8);
          if (flushLen > 0) pushThink(buffer.slice(0, flushLen));
          job._thinkCarry = buffer.slice(flushLen);
          break;
        } else {
          pushThink(buffer.slice(0, endIdx));
          job.thinkEndedAt = Date.now();
          job._inThinkBlock = false;
          buffer = buffer.slice(endIdx + '</think>'.length);
        }
      } else {
        const startIdx = buffer.indexOf('<think>');
        if (startIdx === -1) {
          // Hold back a tail that might contain a partial "<think>"
          const flushLen = Math.max(0, buffer.length - 8);
          visibleDelta += buffer.slice(0, flushLen);
          job._thinkCarry = buffer.slice(flushLen);
          break;
        } else {
          visibleDelta += buffer.slice(0, startIdx);
          job._inThinkBlock = true;
          job.thinkStartedAt = job.thinkStartedAt || Date.now();
          buffer = buffer.slice(startIdx + '<think>'.length);
        }
      }
    }
  }

  return { visibleDelta };
}

// Flush any residual carried text once a provider stream has fully ended.
function flushThinkingCarry(job: BackgroundJob): void {
  const carry = job._thinkCarry;
  if (!carry) return;
  job._thinkCarry = '';
  if (job._inThinkBlock) {
    pushFinalThink(job, carry);
  } else {
    job.fullText += carry;
    job.chunks.push(carry);
  }
}

function pushFinalThink(job: BackgroundJob, text: string): void {
  if (!text) return;
  if (!job.thinkStartedAt) job.thinkStartedAt = Date.now();
  job.thinkText += text;
  job.thinkChunks.push(text);
}

// Cleanup completed jobs older than 1 hour to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of activeJobs.entries()) {
    if ((job.status === 'completed' || job.status === 'failed' || job.status === 'aborted') && (now - job.updatedAt > 3600000)) {
      activeJobs.delete(id);
    }
  }
}, 300000);

// ==========================================
// Unified SSE Protocol (matches FastAPI backend):
//   chunk: `data: {"t":"token","d":"<text>","o":<offset>}`
//   done : `event: done\ndata: {"t":"done","status":"<s>","o":<offset>}`
// ==========================================
function writeJobSSEStream(req: express.Request, res: express.Response, job: BackgroundJob, startOffset: number) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const heartbeatTimer = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 12000);

  let listener: (event: BackgroundJobListenerPayload) => void = () => {};

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    job.listeners.delete(listener);
  };

  req.on('close', cleanup);

  // 1. Catch up on buffered think chunks from offset (agentic reasoning replay)
  let thinkOffset = 0;
  const initialThink = job.thinkChunks.slice(startOffset);
  for (const text of initialThink) {
    const payload = JSON.stringify({ t: 'think', d: text, o: thinkOffset + 1 });
    res.write(`id: t${thinkOffset + 1}\ndata: ${payload}\n\n`);
    thinkOffset += 1;
  }

  // 1. Catch up on buffered chunks from offset
  const initialChunks = job.chunks.slice(startOffset);
  let currentOffset = startOffset;
  for (const text of initialChunks) {
    const payload = JSON.stringify({ t: 'token', d: text, o: currentOffset + 1 });
    res.write(`id: ${currentOffset + 1}\ndata: ${payload}\n\n`);
    currentOffset += 1;
  }

  if (job.status === 'completed') {
    const done = JSON.stringify({ t: 'done', status: 'completed', o: currentOffset });
    res.write(`event: done\ndata: ${done}\n\n`);
    cleanup();
    return res.end();
  }

  if (job.status === 'failed' || job.status === 'aborted') {
    const done = JSON.stringify({ t: 'done', status: job.status, o: currentOffset, error: job.error || 'تم إيقاف التوليد' });
    res.write(`event: done\ndata: ${done}\n\n`);
    cleanup();
    return res.end();
  }

  listener = (event: BackgroundJobListenerPayload) => {
    if (res.writableEnded) return;

    if (event.type === 'think') {
      // Send the full accumulated reasoning (idempotent, avoids offset drift)
      const payload = JSON.stringify({ t: 'think', d: job.thinkText || '', full: true, o: thinkOffset });
      res.write(`id: t${thinkOffset}\ndata: ${payload}\n\n`);
    } else if (event.type === 'chunk' && event.text) {
      const payload = JSON.stringify({ t: 'token', d: event.text, o: currentOffset + 1 });
      res.write(`id: ${currentOffset + 1}\ndata: ${payload}\n\n`);
      currentOffset += 1;
    } else if (event.type === 'error') {
      const done = JSON.stringify({ t: 'done', status: 'failed', o: currentOffset, error: event.error });
      res.write(`event: done\ndata: ${done}\n\n`);
      cleanup();
      res.end();
    } else if (event.type === 'done') {
      const done = JSON.stringify({ t: 'done', status: job.status, o: currentOffset, error: job.error || null });
      res.write(`event: done\ndata: ${done}\n\n`);
      cleanup();
      res.end();
    }
  };

  job.listeners.add(listener);
}

async function startLLMGenerationWorker(job: BackgroundJob, payload: any) {
  const { modelId, providerId, temperature = 0.7, apiKey, baseURL } = payload;
  const messages = injectMijlAiSystem(payload.messages);

  const notifyListeners = (type: 'chunk' | 'think' | 'done' | 'error', text?: string, errMessage?: string) => {
    job.updatedAt = Date.now();
    for (const listener of job.listeners) {
      try {
        listener({ type, text, error: errMessage, fullText: job.fullText, thinkText: type === 'think' ? job.thinkText : undefined });
      } catch (e) {
        console.error('Error notifying job listener:', e);
      }
    }
  };

  try {
    // ------------------------------------------
    // A) Handling g4f (GPT4Free) Provider
    // ------------------------------------------
    if (providerId === 'g4f' || modelId.startsWith('g4f:')) {
      ensureG4FProviderService();

      const g4fModelId = modelId.startsWith('g4f:') ? modelId.replace('g4f:', '') : modelId;

      const sanitizedMessages = messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }));

      const g4fResponse = await fetch(`${G4F_SERVICE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: job.abortController.signal,
        body: JSON.stringify({
          model: g4fModelId,
          messages: sanitizedMessages,
          temperature: typeof temperature === 'number' ? temperature : 0.7,
          stream: true
        })
      });

      if (!g4fResponse.ok) {
        const errBody = await g4fResponse.text();
        job.status = 'failed';
        job.error = `خطأ من مزود g4f (${g4fResponse.status}): ${errBody}`;
        return notifyListeners('error', undefined, job.error);
      }

      const reader = g4fResponse.body?.getReader();
      if (!reader) {
        job.status = 'failed';
        job.error = 'فشل فتح تيار البيانات من مزود g4f';
        return notifyListeners('error', undefined, job.error);
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (job.abortController.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const contentStr = trimmed.slice(6);
            if (contentStr === '[DONE]') break;
            try {
              const json = JSON.parse(contentStr);
              if (json.error) {
                job.status = 'failed';
                job.error = json.error.message || 'خطأ في معالجة طلب g4f';
                return notifyListeners('error', undefined, job.error);
              }
              const deltaObj = json.choices?.[0]?.delta;
              const rawDelta = deltaObj?.content ?? null;
              const { visibleDelta } = processAssistantDelta(job, json, rawDelta);
              if (visibleDelta) {
                job.fullText += visibleDelta;
                job.chunks.push(visibleDelta);
                notifyListeners('chunk', visibleDelta);
              }
              if (job.thinkChunks.length > (job as any)._notifiedThinkCount) {
                (job as any)._notifiedThinkCount = job.thinkChunks.length;
                notifyListeners('think');
              }
            } catch (e) {
              // Ignore non-json SSE frames
            }
          }
        }
      }

      // Flush any residual carried text (partial <think> tag tails) once stream ends
      flushThinkingCarry(job);

      // Post-process sanitization for identity enforcement
      if (job.fullText && (job.fullText.includes('Copilot') || job.fullText.includes('Microsoft') || job.fullText.includes('مايكروسوفت'))) {
        let cleanText = job.fullText
          .replace(/Microsoft Copilot|Copilot|كوبايلوت|كوبايلت/gi, 'مساعد MijlAi الذكي')
          .replace(/شركة Microsoft|شركة مايكروسوفت|مايكروسوفت/gi, 'محمود نمر العجلة (Mhmod Nemr Alijla)');
        job.fullText = cleanText;
      }

      if (job.status === 'generating') {
        job.status = 'completed';
        notifyListeners('done');
      }
      return;
    }

    // ------------------------------------------
    // B) Handling Gemini Provider
    // ------------------------------------------
    if (providerId === 'gemini' || modelId.startsWith('gemini-')) {
      const ai = getGeminiClient(apiKey);
      
      let systemInstruction = '';
      const formattedContents = messages
        .filter((msg: any) => {
          if (msg.role === 'system') {
            systemInstruction = msg.content;
            return false;
          }
          return true;
        })
        .map((msg: any) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

      const stream = await ai.models.generateContentStream({
        model: modelId || 'gemini-3.6-flash',
        contents: formattedContents,
        config: {
          systemInstruction: systemInstruction || undefined,
          temperature: typeof temperature === 'number' ? temperature : 0.7,
        }
      });

      for await (const chunk of stream) {
        if (job.abortController.signal.aborted) break;
        if (chunk.text) {
          job.fullText += chunk.text;
          job.chunks.push(chunk.text);
          notifyListeners('chunk', chunk.text);
        }
      }

      if (job.status === 'generating') {
        job.status = 'completed';
        notifyListeners('done');
      }
      return;
    }

    // ------------------------------------------
    // C) Handling Workers AI Provider
    // ------------------------------------------
    if (providerId === 'workers-ai' || modelId.startsWith('@cf/')) {
      const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const cfApiToken = process.env.CLOUDFLARE_API_TOKEN || apiKey;

      if (cfAccountId && cfApiToken) {
        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${modelId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json'
            },
            signal: job.abortController.signal,
            body: JSON.stringify({
              messages,
              stream: true,
              max_tokens: 2048,
            })
          }
        );

        if (!cfResponse.ok) {
          const errText = await cfResponse.text();
          job.status = 'failed';
          job.error = `فشل استدعاء Cloudflare Workers AI: ${cfResponse.status} ${errText}`;
          return notifyListeners('error', undefined, job.error);
        }

        const reader = cfResponse.body?.getReader();
        if (!reader) {
          job.status = 'failed';
          job.error = 'لم يتم استلام Stream من Cloudflare';
          return notifyListeners('error', undefined, job.error);
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          if (job.abortController.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.response || parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  job.fullText += delta;
                  job.chunks.push(delta);
                  notifyListeners('chunk', delta);
                }
              } catch (e) {
                if (dataStr) {
                  job.fullText += dataStr;
                  job.chunks.push(dataStr);
                  notifyListeners('chunk', dataStr);
                }
              }
            }
          }
        }

        if (job.status === 'generating') {
          job.status = 'completed';
          notifyListeners('done');
        }
        return;
      }

      if (process.env.GEMINI_API_KEY || apiKey) {
        const ai = getGeminiClient(apiKey);
        const stream = await ai.models.generateContentStream({
          model: 'gemini-3.6-flash',
          contents: messages
            .filter((m: any) => m.role !== 'system')
            .map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }))
        });

        for await (const chunk of stream) {
          if (job.abortController.signal.aborted) break;
          if (chunk.text) {
            job.fullText += chunk.text;
            job.chunks.push(chunk.text);
            notifyListeners('chunk', chunk.text);
          }
        }

        if (job.status === 'generating') {
          job.status = 'completed';
          notifyListeners('done');
        }
        return;
      }

      job.status = 'failed';
      job.error = 'يتطلب Cloudflare Workers AI إما CLOUDFLARE_API_TOKEN أو GEMINI_API_KEY كمزود افتراضي.';
      return notifyListeners('error', undefined, job.error);
    }

    // ------------------------------------------
    // D) Generic OpenAI-Compatible Provider Streaming
    // ------------------------------------------
    let targetUrl = 'http://127.0.0.1:8080/v1/chat/completions';
    let targetModel = 'qwen3.8-27b';

    const isLocalProvider = providerId === 'llama'
      || modelId.startsWith('local:')
      || modelId.includes('muse')
      || modelId.includes('glimmer')
      || !!getLocalModelInfo(modelId);

    if (isLocalProvider) {
      // Resolve against the discovered llama.cpp / Ollama endpoints (with a
      // force-refresh fallback so a busy/first probe never loses the model).
      const resolved = await resolveLocalTarget(modelId);
      if (resolved) {
        targetUrl = `${resolved.baseUrl}/v1/chat/completions`;
        targetModel = resolved.serverModel;
      } else if (modelId.startsWith('local:')) {
        // Explicit local model that could not be discovered → fail clearly
        // instead of silently using whatever is on the default port.
        console.error(`[LocalModel] No endpoint resolved for '${modelId}'`);
        job.status = 'failed';
        job.error = `تعذر العثور على النموذج المحلي '${modelId.replace('local:', '').split('/').pop() || modelId}'. تأكد من تشغيل llama.cpp أو Ollama وأن النموذج محمّل (المنافذ المكتشفة: 8080، 8081، 8083).`;
        return notifyListeners('error', undefined, job.error);
      } else {
        console.warn(`[LocalModel] No endpoint resolved for '${modelId}' — falling back to default 8080.`);
      }
    }

    console.log(`[LocalModel] Generating: modelId='${modelId}' provider='${providerId}' -> ${targetUrl} model='${targetModel}'`);

    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      customHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    const localBody: any = {
      model: targetModel,
      messages,
      temperature: 0,
      stream: true
    };
    if (targetModel.includes('mini-flash') || modelId.includes('mini-flash')) {
      if (localBody.reasoning_effort === undefined) localBody.reasoning_effort = 'none';
      if (typeof localBody.max_tokens !== 'number' && typeof localBody.n_predict !== 'number') {
        localBody.max_tokens = 2048;
      }
    }

    const openaiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: customHeaders,
      signal: job.abortController.signal,
      body: JSON.stringify(localBody)
    });

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      console.error(`[LocalModel] Chat completion FAILED url=${targetUrl} model=${targetModel} status=${openaiResponse.status} body=${errBody.slice(0, 800)}`);
      job.status = 'failed';
      job.error = `خطأ من النموذج المحلي (${openaiResponse.status}): ${errBody.slice(0, 500)}`;
      return notifyListeners('error', undefined, job.error);
    }

    const reader = openaiResponse.body?.getReader();
    if (!reader) {
      job.status = 'failed';
      job.error = 'فشل فتح تيار البيانات من المزود الخارجي';
      return notifyListeners('error', undefined, job.error);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (job.abortController.signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const contentStr = trimmed.slice(6);
          if (contentStr === '[DONE]') break;
          try {
            const json = JSON.parse(contentStr);
            const rawDelta = json.choices?.[0]?.delta?.content ?? null;
            const { visibleDelta } = processAssistantDelta(job, json, rawDelta);
            if (visibleDelta) {
              job.fullText += visibleDelta;
              job.chunks.push(visibleDelta);
              notifyListeners('chunk', visibleDelta);
            }
            if (job.thinkChunks.length > (job as any)._notifiedThinkCount) {
              (job as any)._notifiedThinkCount = job.thinkChunks.length;
              notifyListeners('think');
            }
          } catch (e) {
            // ignore non-json chunk parse
          }
        }
      }
    }

    flushThinkingCarry(job);

    if (job.status === 'generating') {
      job.status = 'completed';
      notifyListeners('done');
    }
  } catch (err: any) {
    if (job.abortController.signal.aborted) {
      job.status = 'aborted';
      notifyListeners('done');
    } else {
      console.error(`[LocalModel] Worker error for modelId='${modelId}' provider='${providerId}':`, err?.message || err);
      job.status = 'failed';
      job.error = err.message || 'حدث خطأ غير متوقع أثناء المعالجة في الخلفية';
      notifyListeners('error', undefined, job.error);
    }
  }
}

// ==========================================
// 1) API Routes: /api/chat (Background Decoupled Generation)
// ==========================================
app.post('/api/chat', async (req, res) => {
  const {
    messages,
    modelId: requestedModelId = 'gemini-3.6-flash',
    providerId = 'gemini',
    jobId: incomingJobId,
    chatId: incomingChatId,
    messageId: incomingMessageId
  } = req.body;

  let modelId = requestedModelId;
  if (modelId === 'gemini-2.5-flash' || modelId === 'gemini-2.0-flash' || modelId === 'gemini-1.5-flash') {
    modelId = 'gemini-3.6-flash';
  } else if (modelId === 'gemini-2.5-pro' || modelId === 'gemini-2.0-pro' || modelId === 'gemini-1.5-pro') {
    modelId = 'gemini-3.1-pro-preview';
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'قائمة الرسائل مطلوبة' });
  }

  const jobId = incomingJobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const chatId = incomingChatId || `chat_${Date.now()}`;
  const messageId = incomingMessageId || `msg_${Date.now()}`;

  let job = activeJobs.get(jobId);
  if (!job) {
    job = {
      jobId,
      chatId,
      messageId,
      status: 'generating',
      fullText: '',
      chunks: [],
      thinkText: '',
      thinkChunks: [],
      _inThinkBlock: false,
      _thinkCarry: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelId,
      providerId,
      listeners: new Set(),
      abortController: new AbortController()
    };
    activeJobs.set(jobId, job);
    // Start background generation without awaiting
    startLLMGenerationWorker(job, { ...req.body, modelId });
  }

  // Stream back using the unified SSE protocol (compatible with both frontends)
  return writeJobSSEStream(req, res, job, 0);
});

// ==========================================
// Reconnection & Sync API Endpoints
// ==========================================

// Check status of background generation task (for Page Visibility sync on mobile)
app.get('/api/chat/status', (req, res) => {
  const jobId = (req.query.job_id || req.query.jobId) as string;
  const chatId = (req.query.chat_id || req.query.chatId) as string;

  let job = jobId ? activeJobs.get(jobId) : undefined;
  if (!job && chatId) {
    for (const j of activeJobs.values()) {
      if (j.chatId === chatId) {
        job = j;
        break;
      }
    }
  }

  if (!job) {
    return res.json({ status: 'not_found', fullText: '' });
  }

  return res.json({
    jobId: job.jobId,
    chatId: job.chatId,
    messageId: job.messageId,
    status: job.status,
    fullText: job.fullText,
    chunksCount: job.chunks.length,
    error: job.error,
    updatedAt: job.updatedAt
  });
});

// Proxy decoupled zero-latency FastAPI endpoints if active
app.post(['/send', '/api/chat/send'], async (req, res) => {
  const prompt = req.body?.prompt;
  const reqModel = String(req.body.model || 'gemini');
  const isLocalModel = reqModel.startsWith('local:') || !!getLocalModelInfo(reqModel);

  if (!isLocalModel) {
    ensureFastApiService();
    try {
      const fastApiRes = await fetch('http://127.0.0.1:8088/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      if (fastApiRes.ok) {
        const text = await fastApiRes.text();
        try {
          const data = JSON.parse(text);
          return res.json(data);
        } catch (e) {}
      }
    } catch (err) {
      // Fallback to Express handler if FastAPI is warming up
    }
  } else {
    // Local models: warm discovery cache so section D can route correctly
    try {
      await discoverLocalModels();
      const info = getLocalModelInfo(reqModel);
      if (!info) {
        console.warn(`[LocalModel] '${reqModel}' not found in discovery cache — will force refresh during generation.`);
      }
    } catch (e) {
      console.error('[LocalModel] Discovery warm-up failed:', e);
    }
  }

  // Fallback Express implementation for /send — actually generates via the background worker
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'Prompt cannot be empty', status: 400 });
  }

  const jobId = `task_${Math.random().toString(36).substring(2, 10)}`;
  const chatId = req.body.chat_id || 'default_chat';
  const modelId = reqModel;

  const job: BackgroundJob = {
    jobId,
    chatId,
    messageId: `msg_${Date.now()}`,
    status: 'generating',
    fullText: '',
    chunks: [],
    thinkText: '',
    thinkChunks: [],
    _inThinkBlock: false,
    _thinkCarry: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    modelId,
    providerId: isLocalModel ? 'llama' : 'g4f',
    listeners: new Set(),
    abortController: new AbortController()
  };
  activeJobs.set(jobId, job);

  const messages = Array.isArray(req.body.messages) && req.body.messages.length
    ? req.body.messages
    : [{ role: 'user', content: String(prompt) }];

  // Start background generation without awaiting (decoupled)
  startLLMGenerationWorker(job, {
    messages,
    modelId,
    providerId: isLocalModel ? 'llama' : 'g4f',
    temperature: typeof req.body.temperature === 'number' ? req.body.temperature : 0.7
  });

  return res.json({ task_id: jobId, chat_id: chatId, status: 'queued', timestamp: Date.now() });
});

app.get(['/preview/:taskId', '/api/chat/preview/:taskId'], async (req, res) => {
  const taskId = req.params.taskId;

  // 1. Check in-memory Express jobs first
  const expressJob = activeJobs.get(taskId);
  if (expressJob) {
    return res.json({
      task_id: taskId,
      status: expressJob.status,
      full_text: expressJob.fullText,
      token_count: expressJob.chunks.length,
      last_chunk: expressJob.chunks[expressJob.chunks.length - 1] || '',
      thinking: expressJob.thinkText || '',
      think_duration_ms: (expressJob.thinkStartedAt && expressJob.thinkEndedAt) ? (expressJob.thinkEndedAt - expressJob.thinkStartedAt) : null,
      error: expressJob.error || null
    });
  }

  // 2. Fallback to FastAPI backend
  ensureFastApiService();
  try {
    const fastApiRes = await fetch(`http://127.0.0.1:8088/preview/${taskId}`);
    if (fastApiRes.ok) {
      const data = await fastApiRes.json();
      return res.json(data);
    }
  } catch (err) {}
  return res.json({ task_id: taskId, status: 'not_found', full_text: '', token_count: 0 });
});

app.get(['/stream/:taskId', '/api/chat/stream/:taskId'], async (req, res, next) => {
  const taskId = req.params.taskId || (req.query.job_id || req.query.jobId) as string;
  
  if (taskId && taskId.startsWith('task_')) {
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

    // 1. Check in-memory Express jobs first (unified SSE protocol)
    const expressJob = activeJobs.get(taskId);
    if (expressJob) {
      return writeJobSSEStream(req, res, expressJob, offset);
    }

    // 2. Fallback to FastAPI backend stream proxy
    ensureFastApiService();
    try {
      const fastApiRes = await fetch(`http://127.0.0.1:8088/stream/${taskId}?offset=${offset}`, {
        headers: { 'Accept': 'text/event-stream' }
      });
      if (fastApiRes.ok) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
        }
        
        const reader = fastApiRes.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.writableEnded) {
              res.write(value);
            }
          }
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
      }
    } catch (err) {}
    
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    if (!res.writableEnded) {
      res.write('data: {"t":"done","status":"completed"}\n\n');
      res.end();
    }
    return;
  }
  
  next();
});

// Re-subscribe SSE stream for a background job (unified protocol with offset resumption)
app.get(['/api/chat/stream/:jobId', '/api/chat/stream'], (req, res) => {
  const jobId = req.params.jobId || (req.query.job_id || req.query.jobId) as string;
  const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return writeJobSSEStream(req, res, job, offset);
});

// Abort background generation job
app.post('/api/chat/abort', (req, res) => {
  const { jobId, chatId } = req.body;
  let job = jobId ? activeJobs.get(jobId) : undefined;

  if (!job && chatId) {
    for (const j of activeJobs.values()) {
      if (j.chatId === chatId && j.status === 'generating') {
        job = j;
        break;
      }
    }
  }

  if (job) {
    job.status = 'aborted';
    job.abortController.abort();
    for (const listener of job.listeners) {
      try {
        listener({ type: 'done', fullText: job.fullText });
      } catch (e) {}
    }
    job.listeners.clear();
    return res.json({ status: 'aborted', jobId: job.jobId });
  }

  return res.json({ status: 'not_found' });
});

// Lightweight Ping/Health check endpoint for frontend ConnectionManager
app.get(['/api/ping', '/api/health'], (req, res) => {
  return res.json({ status: 'ok', timestamp: Date.now() });
});

// ==========================================
// Agentic Tools: Web Search + Python Workspace
// ==========================================
const WORKSPACES_ROOT = path.join(process.cwd(), 'workspaces');

function resolveWorkspace(sessionId: string): string {
  const safe = (sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
  const dir = path.join(WORKSPACES_ROOT, safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Internet search via the local g4f provider service (DuckDuckGo backend, keyless)
app.post('/api/search', async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query مطلوب' });

    ensureG4FProviderService();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const upstream = await fetch('http://127.0.0.1:5050/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_results: 6 }),
        signal: controller.signal
      });
      if (!upstream.ok) throw new Error(`search upstream ${upstream.status}`);
      const data = await upstream.json();
      return res.json(data);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'فشل البحث في الويب' });
  }
});

// Python workspace execution: sandboxed subprocess per run, persistent
// per-session workspace directory for files/outputs.
app.post('/api/python/run', async (req, res) => {
  const sessionId = String(req.body?.sessionId || 'default');
  const code = String(req.body?.code || '');
  if (!code.trim()) return res.status(400).json({ error: 'code مطلوب' });

  // Hard limits
  if (code.length > 60000) return res.status(413).json({ error: 'الكود طويل جداً (الحد 60KB)' });

  const workdir = resolveWorkspace(sessionId);
  const filePath = path.join(workdir, `cell_${Date.now()}.py`);
  fs.writeFileSync(filePath, code, 'utf-8');

  const startedAt = Date.now();
  let child: any;
  try {
    child = spawn('python3', ['-u', filePath], {
      cwd: workdir,
      env: { PATH: process.env.PATH, HOME: workdir, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل تشغيل بايثون' });
  }

  let stdout = '';
  let stderr = '';
  const MAX_OUTPUT = 100000; // 100KB cap

  const timer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch (e) {}
  }, 15000);

  child.stdout.on('data', (d: Buffer) => { if (stdout.length < MAX_OUTPUT) stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { if (stderr.length < MAX_OUTPUT) stderr += d.toString(); });

  child.on('error', (err: Error) => {
    clearTimeout(timer);
    return res.status(500).json({ error: err.message });
  });

  child.on('close', (exitCode: number | null) => {
    clearTimeout(timer);
    const durationMs = Date.now() - startedAt;
    const timedOut = exitCode === null || durationMs >= 14800;
    res.json({
      ok: !timedOut && exitCode === 0,
      exit_code: exitCode,
      stdout: stdout.slice(0, MAX_OUTPUT),
      stderr: stderr.slice(0, MAX_OUTPUT),
      timed_out: timedOut,
      duration_ms: durationMs,
      workspace: path.basename(workdir),
      files: fs.readdirSync(workdir).filter(f => f !== `cell_${path.basename(filePath, '.py')}` && !f.startsWith('cell_')).slice(0, 50)
    });
  });
});

app.get('/api/python/files/:sessionId', (req, res) => {
  const workdir = resolveWorkspace(String(req.params.sessionId));
  const files = fs.readdirSync(workdir)
    .filter(f => !f.startsWith('cell_'))
    .map(f => {
      const st = fs.statSync(path.join(workdir, f));
      return { name: f, size: st.size, modified: st.mtimeMs };
    });
  res.json({ workspace: req.params.sessionId, files });
});

// ==========================================
// Auth & Admin Panel Proxies (FastAPI Port 8088)
// ==========================================
app.use(['/api/auth', '/api/admin'], async (req, res) => {
  ensureFastApiService();
  try {
    const targetUrl = `http://127.0.0.1:8088${req.originalUrl}`;
    const options: any = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const fastRes = await fetch(targetUrl, options);
    const text = await fastRes.text();
    try {
      const data = JSON.parse(text);
      return res.status(fastRes.status).json(data);
    } catch (e) {
      return res.status(fastRes.status >= 400 ? fastRes.status : 500).json({ error: text || 'Non-JSON response from backend' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'FastAPI Backend service unavailable' });
  }
});

// ==========================================
// 1.5) API Routes: Image Generation (Pollinations.ai)
// ==========================================
app.post('/api/image/generate', async (req, res) => {
  try {
    const { prompt, model = 'flux', width = 1024, height = 1024, seed, nologo = true, isPrivate = true, enhance = true, transparent = false } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const params = new URLSearchParams({
      prompt: prompt.trim(),
      model,
      width: String(width),
      height: String(height),
      nologo: String(nologo),
      private: String(isPrivate),
      enhance: String(enhance),
      transparent: String(transparent),
    });
    if (seed !== undefined && seed !== null) params.set('seed', String(seed));

    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?${params.toString()}`;
    
    // Return the image URL directly (Pollinations.ai serves the image at this URL)
    return res.json({
      success: true,
      url: pollinationsUrl,
      prompt: prompt.trim(),
      model,
      width,
      height,
      seed: seed ?? Math.floor(Math.random() * 1000000),
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('Image generation error:', err);
    return res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

app.get('/api/image/models', (req, res) => {
  return res.json({
    models: [
      { id: 'flux', name: 'Flux', description: 'High-quality general purpose', default: true },
      { id: 'gptimage', name: 'GPT-Image', description: 'OpenAI style images' },
      { id: 'midjourney', name: 'Midjourney', description: 'Artistic style' },
      { id: 'dall-e-3', name: 'DALL-E 3', description: 'OpenAI DALL-E 3' },
    ]
  });
});

// ==========================================
// 2) API Routes: Models Discovery & Chat Completions Proxy
// ==========================================
app.get(['/api/models', '/api/v1/chat/models'], (req, res) => {
  ensureG4FProviderService();
  return handleModelsRequest(req, res);
});

// Health check for a specific local model (used by the frontend so it never has
// to fetch llama.cpp/Ollama directly from the browser, avoiding CORS issues).
app.get('/api/local/health', async (req, res) => {
  const modelId = String(req.query.model || '');
  if (!modelId) {
    return res.status(400).json({ ok: false, error: 'model query param required' });
  }
  try {
    const resolved = await resolveLocalTarget(modelId);
    if (!resolved) {
      return res.status(404).json({ ok: false, error: 'local model not reachable' });
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    const up = await fetch(`${resolved.baseUrl}/v1/models`, { signal: abort.signal });
    clearTimeout(timer);
    if (!up.ok) {
      return res.status(502).json({ ok: false, error: `endpoint returned ${up.status}` });
    }
    const data = await up.json();
    const found = (data?.data || data?.models || []).some((m: any) => m?.id === resolved.serverModel || m?.model === resolved.serverModel);
    return res.json({ ok: found, baseUrl: resolved.baseUrl, serverModel: resolved.serverModel, model: modelId });
  } catch (err: any) {
    return res.status(502).json({ ok: false, error: err?.message || 'health check failed' });
  }
});


// OpenAI-compatible chat completions proxy handler
// Supports: g4f (cloud-free), local llama.cpp/Ollama models, and any OpenAI-compatible
// baseURL passed via `baseURL` (e.g. from a custom connection in the frontend).
app.post(['/api/chat/completions', '/api/v1/chat/completions'], async (req, res) => {
  const { model = '', stream = true } = req.body;

  // 1) g4f (GPT4Free) cloud models
  if (model.startsWith('g4f:') || req.body.provider === 'g4f') {
    ensureG4FProviderService();
    try {
      const g4fRes = await fetch(`${G4F_SERVICE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req.body, messages: injectMijlAiSystem(req.body.messages || []) })
      });

      res.status(g4fRes.status);
      g4fRes.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      if (stream) {
        const reader = g4fRes.body?.getReader();
        if (!reader) return res.status(500).json({ error: { message: 'No stream reader available' } });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      } else {
        const data = await g4fRes.json();
        return res.json(data);
      }
    } catch (err: any) {
      return res.status(500).json({
        error: {
          message: err.message || 'Error communicating with g4f service',
          type: 'g4f_proxy_error'
        }
      });
    }
  }

  // 2) Local models (llama.cpp / Ollama / vLLM) via discovery
  if (model.startsWith('local:') || req.body.provider === 'llama' || getLocalModelInfo(model)) {
    try {
      const resolved = await resolveLocalTarget(model);
      if (!resolved) {
        console.error(`[LocalModel] Proxy: no endpoint resolved for model '${model}'`);
        return res.status(502).json({ error: { message: 'تعذر الوصول إلى النموذج المحلي. تأكد من أن خادم llama.cpp/Ollama يعمل.', type: 'local_model_unreachable' } });
      }

      const targetUrl = `${resolved.baseUrl}/v1/chat/completions`;
      // Override the requested model name with the exact id the llama server exposes
      const body: any = { ...req.body, model: resolved.serverModel, messages: injectMijlAiSystem(req.body.messages || []), temperature: 0 };
      // "mijlai mini flash": answer directly (disable reasoning) and cap output so
      // the small context never overflows. Other local models keep their behavior.
      if (model.includes('mini-flash') || resolved.serverModel.includes('mini-flash')) {
        if (body.reasoning_effort === undefined) body.reasoning_effort = 'none';
        if (typeof body.max_tokens !== 'number' && typeof body.n_predict !== 'number') {
          body.max_tokens = 2048;
        }
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (req.body.apiKey) headers['Authorization'] = `Bearer ${req.body.apiKey}`;

      console.log(`[LocalModel] Proxy: '${model}' -> ${targetUrl} model='${resolved.serverModel}' stream=${stream}`);
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!upstream.ok) {
        const errText = await upstream.text();
        console.error(`[LocalModel] Proxy upstream error ${upstream.status}: ${errText.slice(0, 500)}`);
        return res.status(502).json({ error: { message: `فشل النموذج المحلي (${upstream.status}): ${errText.slice(0, 300)}`, type: 'local_model_error' } });
      }

      res.status(200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || (stream ? 'text/event-stream' : 'application/json'));
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');

      if (stream) {
        const reader = upstream.body?.getReader();
        if (!reader) return res.status(500).json({ error: { message: 'No stream reader available' } });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      } else {
        const data = await upstream.json();
        return res.json(data);
      }
    } catch (err: any) {
      console.error('[LocalModel] Proxy error:', err?.message || err);
      return res.status(500).json({
        error: { message: err?.message || 'خطأ أثناء الاتصال بالنموذج المحلي', type: 'local_model_proxy_error' }
      });
    }
  }

  // 3) Custom OpenAI-compatible baseURL (user-defined connection)
  if (req.body.baseURL) {
    try {
      const upstreamUrl = `${String(req.body.baseURL).replace(/\/$/, '')}/v1/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (req.body.apiKey) headers['Authorization'] = `Bearer ${req.body.apiKey}`;
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...req.body, messages: injectMijlAiSystem(req.body.messages || []) })
      });
      if (!upstream.ok) {
        const errText = await upstream.text();
        return res.status(502).json({ error: { message: `فشل المزود (${upstream.status}): ${errText.slice(0, 300)}`, type: 'provider_error' } });
      }
      res.status(200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || (stream ? 'text/event-stream' : 'application/json'));
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      if (stream) {
        const reader = upstream.body?.getReader();
        if (!reader) return res.status(500).json({ error: { message: 'No stream reader available' } });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      } else {
        const data = await upstream.json();
        return res.json(data);
      }
    } catch (err: any) {
      return res.status(500).json({
        error: { message: err?.message || 'خطأ أثناء الاتصال بالمزود', type: 'provider_proxy_error' }
      });
    }
  }

  // Unknown model type
  return res.status(400).json({ error: { message: 'النموذج غير مدعوم بواسطة هذا العنوان. استخدم نموذج g4f أو local: أو حدد baseURL.', type: 'unsupported_model' } });
});

// ==========================================
// 3) Vite & Express App Setup
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // The service worker must always be revalidated (never cached) so that new
    // builds/deployments propagate to returning clients immediately.
    app.get('/sw.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'sw.js'));
    });
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // HTTPS (self-signed certificate) — enables secure https:// access out of the box
  const sslDir = path.join(process.cwd(), 'ssl');
  const certPath = path.join(sslDir, 'mijlai.crt');
  const keyPath = path.join(sslDir, 'mijlai.key');
  const certAvailable = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (certAvailable) {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
      console.log(`🔒 MijlAi HTTPS running at https://0.0.0.0:${PORT} (self-signed certificate)`);
    });

    // Optional: keep plain HTTP alive on PORT+1 for local/internal access
    const httpPort = PORT + 2;
    app.listen(httpPort, '0.0.0.0', () => {
      console.log(`🌐 MijlAi HTTP fallback running at http://0.0.0.0:${httpPort}`);
    });
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MijlAi Server running at http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();
