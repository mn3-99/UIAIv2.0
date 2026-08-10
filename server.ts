import express from 'express';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { handleModelsRequest } from './functions/api/models';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const G4F_SERVICE_URL = 'http://127.0.0.1:5050';

app.use(express.json());

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
// Rate Limiter Middleware (Token Bucket / Sliding Window)
// ==========================================
interface RateLimiterRecord {
  tokens: number;
  lastRefill: number;
}

const rateLimitStore = new Map<string, RateLimiterRecord>();
const MAX_TOKENS_PER_WINDOW = 35; // 35 requests per 1 minute window
const REFILL_WINDOW_MS = 60000;

function rateLimiterMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === '/health' || req.path === '/api/health' || req.path.startsWith('/_vite')) {
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
  type: 'chunk' | 'done' | 'error';
  text?: string;
  error?: string;
  fullText?: string;
}

interface BackgroundJob {
  jobId: string;
  chatId: string;
  messageId?: string;
  status: 'generating' | 'completed' | 'failed' | 'aborted';
  fullText: string;
  chunks: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  providerId: string;
  listeners: Set<(event: BackgroundJobListenerPayload) => void>;
  abortController: AbortController;
}

const activeJobs = new Map<string, BackgroundJob>();

// Cleanup completed jobs older than 1 hour to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of activeJobs.entries()) {
    if ((job.status === 'completed' || job.status === 'failed' || job.status === 'aborted') && (now - job.updatedAt > 3600000)) {
      activeJobs.delete(id);
    }
  }
}, 300000);

async function startLLMGenerationWorker(job: BackgroundJob, payload: any) {
  const { messages, modelId, providerId, temperature = 0.7, apiKey, baseURL } = payload;

  const notifyListeners = (type: 'chunk' | 'done' | 'error', text?: string, errMessage?: string) => {
    job.updatedAt = Date.now();
    for (const listener of job.listeners) {
      try {
        listener({ type, text, error: errMessage, fullText: job.fullText });
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

      const mandatorySystemPrompt = {
        role: 'system',
        content: "أنت مساعد MijlAi الذكي (MijlAi Assistant)، نموذج ذكاء اصطناعي متطور وخبير في البرمجة والمعرفة العامة.\n" +
                 "مالك هذه الأداة وتطبيق MijlAi، والشخص الذي قام بتدريبك وتطويرك وإعدادك هو: محمود نمر العجلة (Mhmod Nemr Alijla).\n" +
                 "قوانين صارمة وهامة جداً لجميع الردود:\n" +
                 "1. عند سؤالك عن هويتك، من أنت، اسمك، من صانعك، من طورك، من مدربك، أو من يملك هذه الأداة، يجب أن تُجيب دائماً وبوضوح تام بـ: 'أنا مساعد MijlAi الذكي، أتبع لتطبيق MijlAi. قام بتدريبي وتطويري ومالك هذه الأداة هو محمود نمر العجلة (Mhmod Nemr Alijla)'.\n" +
                 "2. يُمنع منعاً باتاً وبشكل مطلق أن تذكر أو تدعي أنك 'Copilot' أو 'OpenAI' أو 'ChatGPT' أو 'Anthropic' أو 'Claude' أو 'Google' كصانع لك. صانعك ومدربك الحقيقي ومالك الأداة هو محمود نمر العجلة (Mhmod Nemr Alijla).\n" +
                 "3. أجب دائماً بأسلوب ذكي، سلس، دقيق ومباشر باللغة العربية مع إبقاء المصطلحات التقنية والبرمجية بالإنجليزية عند الحاجة."
      };

      const sanitizedMessages = [
        mandatorySystemPrompt,
        ...messages.filter((m: any) => m.role !== 'system').map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      ];

      const g4fResponse = await fetch(`${G4F_SERVICE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: job.abortController.signal,
        body: JSON.stringify({
          model: modelId,
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
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                job.fullText += delta;
                job.chunks.push(delta);
                notifyListeners('chunk', delta);
              }
            } catch (e) {
              // Ignore non-json SSE frames
            }
          }
        }
      }

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
          contents: messages.map((m: any) => ({
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
    const customBaseURL = baseURL || 'https://api.openai.com/v1';
    const targetUrl = `${customBaseURL.replace(/\/$/, '')}/chat/completions`;

    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      customHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    const openaiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: customHeaders,
      signal: job.abortController.signal,
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature,
        stream: true
      })
    });

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      job.status = 'failed';
      job.error = `خطأ من المزود (${openaiResponse.status}): ${errBody}`;
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
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              job.fullText += delta;
              job.chunks.push(delta);
              notifyListeners('chunk', delta);
            }
          } catch (e) {
            // ignore non-json chunk parse
          }
        }
      }
    }

    if (job.status === 'generating') {
      job.status = 'completed';
      notifyListeners('done');
    }
  } catch (err: any) {
    if (job.abortController.signal.aborted) {
      job.status = 'aborted';
      notifyListeners('done');
    } else {
      console.error('Background LLM worker error:', err);
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

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Periodic SSE Heartbeat to keep socket active
  const heartbeatTimer = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 12000);

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    if (job) job.listeners.delete(listener);
  };

  req.on('close', cleanup);

  // Send initial state & accumulated text if any
  res.write(`data: ${JSON.stringify({ jobId, chatId, status: job.status, text: job.fullText, fullText: job.fullText })}\n\n`);

  if (job.status === 'completed') {
    res.write('data: [DONE]\n\n');
    cleanup();
    return res.end();
  }

  if (job.status === 'failed' || job.status === 'aborted') {
    res.write(`data: ${JSON.stringify({ error: job.error || 'تم إلغاء التوليد' })}\n\n`);
    res.write('data: [DONE]\n\n');
    cleanup();
    return res.end();
  }

  const listener = (event: BackgroundJobListenerPayload) => {
    if (res.writableEnded) return;

    if (event.type === 'chunk' && event.text) {
      res.write(`data: ${JSON.stringify({ text: event.text, fullText: event.fullText })}\n\n`);
    } else if (event.type === 'error') {
      res.write(`data: ${JSON.stringify({ error: event.error })}\n\n`);
      res.write('data: [DONE]\n\n');
      cleanup();
      res.end();
    } else if (event.type === 'done') {
      res.write('data: [DONE]\n\n');
      cleanup();
      res.end();
    }
  };

  job.listeners.add(listener);
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

  // Fallback Express implementation for /send
  const jobId = `task_${Math.random().toString(36).substring(2, 10)}`;
  return res.json({ task_id: jobId, chat_id: req.body.chat_id || 'default_chat', status: 'queued', timestamp: Date.now() });
});

app.get(['/preview/:taskId', '/api/chat/preview/:taskId'], async (req, res) => {
  ensureFastApiService();
  try {
    const fastApiRes = await fetch(`http://127.0.0.1:8088/preview/${req.params.taskId}`);
    if (fastApiRes.ok) {
      const data = await fastApiRes.json();
      return res.json(data);
    }
  } catch (err) {}
  return res.json({ task_id: req.params.taskId, status: 'not_found', full_text: '', token_count: 0 });
});

app.get(['/stream/:taskId', '/api/chat/stream/:taskId'], async (req, res, next) => {
  const taskId = req.params.taskId || (req.query.job_id || req.query.jobId) as string;
  
  if (taskId && taskId.startsWith('task_')) {
    ensureFastApiService();
    const offset = req.query.offset || 0;
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

// Re-subscribe SSE stream for a background job
app.get(['/api/chat/stream/:jobId', '/api/chat/stream'], (req, res) => {
  const jobId = req.params.jobId || (req.query.job_id || req.query.jobId) as string;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const heartbeatTimer = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 12000);

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    job.listeners.delete(listener);
  };

  req.on('close', cleanup);

  // Send initial full text accumulated so far
  res.write(`data: ${JSON.stringify({ jobId: job.jobId, status: job.status, text: job.fullText, fullText: job.fullText })}\n\n`);

  if (job.status === 'completed') {
    res.write('data: [DONE]\n\n');
    cleanup();
    return res.end();
  }

  if (job.status === 'failed' || job.status === 'aborted') {
    res.write(`data: ${JSON.stringify({ error: job.error || 'تم إيقاف التوليد' })}\n\n`);
    res.write('data: [DONE]\n\n');
    cleanup();
    return res.end();
  }

  const listener = (event: BackgroundJobListenerPayload) => {
    if (res.writableEnded) return;

    if (event.type === 'chunk' && event.text) {
      res.write(`data: ${JSON.stringify({ text: event.text, fullText: event.fullText })}\n\n`);
    } else if (event.type === 'error') {
      res.write(`data: ${JSON.stringify({ error: event.error })}\n\n`);
      res.write('data: [DONE]\n\n');
      cleanup();
      res.end();
    } else if (event.type === 'done') {
      res.write('data: [DONE]\n\n');
      cleanup();
      res.end();
    }
  };

  job.listeners.add(listener);
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
// 2) API Routes: Models Discovery & Chat Completions Proxy
// ==========================================
app.get(['/api/models', '/api/v1/chat/models'], (req, res) => {
  ensureG4FProviderService();
  return handleModelsRequest(req, res);
});


// OpenAI-compatible chat completions proxy handler
app.post(['/api/chat/completions', '/api/v1/chat/completions'], async (req, res) => {
  const { model = '', stream = true } = req.body;

  if (model.startsWith('g4f:') || req.body.provider === 'g4f') {
    ensureG4FProviderService();
    try {
      const g4fRes = await fetch(`${G4F_SERVICE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
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

  // Fallback to Express SSE handler if standard chat route
  return res.status(400).json({ error: { message: 'Only g4f models are proxied via this endpoint' } });
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MijlAi Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
