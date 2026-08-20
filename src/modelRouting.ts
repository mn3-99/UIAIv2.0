/**
 * Unified Model Routing Layer for MijIAi Pro
 * 
 * Responsibilities:
 * - Map model IDs (gemini, local:qwen3.8-27b, etc.) to base URLs and providers
 * - Health‑check each model endpoint
 * - Provide fallback selection (local ↔ cloud)
 * - Export a single `sendChat` function used by the UI and tests
 */

// ---------------------------------------------------------------------------
// Model configuration (kept in sync with /api/models and local discovery)
// ---------------------------------------------------------------------------

type ModelConfig = {
  id: string;
  name: string;
  provider: 'local' | 'g4f' | 'google' | 'openai' | 'cohere' | 'rhymes';
  isFree: boolean;
  baseUrl?: string; // for local models, e.g. http://127.0.0.1:8080
  fallbackTo?: ModelConfig['id'][];
};

// Mapped from the aggregated /api/models response + local discovery
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // --- Cloud models (g4f‑backed) ---
  gemini: {
    id: 'gemini',
    name: 'Gemini (Fast)',
    provider: 'google',
    isFree: true,
    fallbackTo: ['gemini-3.5-flash', 'gemini-3.6-flash'],
  },
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'google',
    isFree: true,
    fallbackTo: ['gemini', 'gemini-3.6-flash'],
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'google',
    isFree: true,
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  gemini_auto: {
    id: 'gemini-auto',
    name: 'Gemini Auto',
    provider: 'google',
    isFree: true,
    fallbackTo: ['gemini-3.5-flash', 'gemini-3.6-flash'],
  },
  gpt4: {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    isFree: false,
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  command_a: {
    id: 'command-a',
    name: 'Command A',
    provider: 'cohere',
    isFree: true,
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  aria: {
    id: 'aria',
    name: 'Aria',
    provider: 'rhymes',
    isFree: true,
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },

  // --- Local Llama.cpp models ---
  'local:mijlai-mini-flash': {
    id: 'local:mijlai-mini-flash',
    name: 'mijlai mini flash',
    provider: 'local',
    isFree: true,
    baseUrl: 'http://127.0.0.1:8083',
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  'local:mijlai-uncensored': {
    id: 'local:mijlai-uncensored',
    name: 'mijlai uncensored',
    provider: 'local',
    isFree: true,
    baseUrl: 'http://127.0.0.1:8080',
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  'local:mijlai-pro': {
    id: 'local:mijlai-pro',
    name: 'mijlai pro',
    provider: 'local',
    isFree: true,
    baseUrl: 'http://127.0.0.1:8081',
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  'local:qwen3.8-27b': {
    id: 'local:qwen3.8-27b',
    name: 'qwen3.8-27b (محلي · llama.cpp)',
    provider: 'local',
    isFree: true,
    baseUrl: 'http://127.0.0.1:8080',
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
  'local:muse-glimmer-30b': {
    id: 'local:muse-glimmer-30b',
    name: 'muse-glimmer-30b (محلي · llama.cpp)',
    provider: 'local',
    isFree: true,
    baseUrl: 'http://127.0.0.1:8081',
    fallbackTo: ['gemini', 'gemini-3.5-flash'],
  },
};

// ---------------------------------------------------------------------------
// Helper: get config for a model ID (returns null if unknown)
// ---------------------------------------------------------------------------

export function getConfig(modelId: string): ModelConfig | null {
  if (MODEL_CONFIGS[modelId]) return MODEL_CONFIGS[modelId];
  // Dynamic local llama.cpp model (id looks like 'local:/path/to/model.gguf')
  if (modelId.startsWith('local:')) {
    const shortName = modelId.replace('local:', '').split('/').pop()?.replace(/\.gguf$/i, '') || modelId;
    return {
      id: modelId,
      name: `${shortName} (محلي · llama.cpp)`,
      provider: 'local',
      isFree: true,
      fallbackTo: ['gemini', 'gemini-3.5-flash'],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Health‑check: try a tiny request; return true if the endpoint replies quickly
// ---------------------------------------------------------------------------

export async function healthCheck(modelId: string): Promise<boolean> {
  const cfg = getConfig(modelId);
  if (!cfg) return false;
  if (cfg.provider === 'local') {
    // Check through the backend proxy so the browser never has to reach the
    // llama.cpp/Ollama port directly (avoids CORS + localhost-on-device issues).
    try {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 8000);
      const res = await fetch(`/api/local/health?model=${encodeURIComponent(modelId)}`, { signal: abort.signal });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.ok;
    } catch {
      return false;
    }
  }
  // Cloud models: considered healthy by default
  return true;
}

// ---------------------------------------------------------------------------
// Fallback selector: pick the first healthy fallback provider
// ---------------------------------------------------------------------------

export async function pickFallback(
  modelId: string,
  exclude: Set<string> = new Set()
): Promise<ModelConfig | null> {
  const cfg = getConfig(modelId);
  if (!cfg) return null;
  for (const fallbackId of cfg.fallbackTo ?? []) {
    if (exclude.has(fallbackId)) continue;
    const fallCfg = getConfig(fallbackId);
    if (!fallCfg) continue;
    if (fallCfg.provider === 'local') {
      const healthy = await healthCheck(fallbackId);
      if (healthy) return fallCfg;
    } else {
      // cloud models considered healthy by default
      return fallCfg;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core: dispatch a chat request to the correct backend
//
// Returns { taskId, streamAsyncGenerator }
// ---------------------------------------------------------------------------

export async function sendChat(opts: {
  prompt: string;
  chatId: string;
  model: string;
  extra?: Record<string, unknown>;
}): Promise<{
  taskId: string;
  stream: AsyncGenerator<{ done: boolean; value: Uint8Array }, void, unknown>;
}> {
  const cfg = getConfig(opts.model);
  if (!cfg) throw new Error(`Unknown model ID: ${opts.model}`);

  const base = process.env.BASE_URL || '';
  // Always route chat requests through the main MijlAi server, which
  // discovers the right local llama.cpp endpoint (see server.ts getLocalModelInfo).
  const url = `${base}/api/chat/send`;

  const body = JSON.stringify({
    prompt: opts.prompt,
    chat_id: opts.chatId,
    model: opts.model,
    ...(opts.extra ?? {}),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    // If local model failed, try fallback
    if (cfg.provider === 'local') {
      const fall = await pickFallback(opts.model, new Set([opts.model]));
      if (fall) {
        const fallUrl = `${base}/api/chat/send`;
        const fallRes = await fetch(fallUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!fallRes.ok) throw new Error(`Fallback failed: ${fallRes.status}`);
        const fallJson = await fallRes.json();
        return createStreamFromTask(fallJson.taskId, fall);
      }
    }
    throw new Error(`Chat send failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (!json.taskId) throw new Error('No task_id returned');

  return createStreamFromTask(json.taskId, cfg);
}

// ---------------------------------------------------------------------------
// Internal: create an AsyncGenerator from an SSE task endpoint
// ---------------------------------------------------------------------------

async function* createStreamFromTask(
  taskId: string,
  cfg: ModelConfig
): AsyncGenerator<{ done: boolean; value: Uint8Array }> {
  const streamUrl = `${process.env.BASE_URL || ''}/api/chat/stream/${taskId}?offset=0`;
  const res = await fetch(streamUrl);
  if (!res.ok) throw new Error(`Stream fetch ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) break;

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: done')) {
        yield { done: true, value: new Uint8Array() };
        return;
      }
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.t === 'token') {
            const chunk = Buffer.from(data.d ?? '', 'utf-8');
            yield { done: false, value: chunk };
          }
          if (data.t === 'done') {
            yield { done: true, value: new Uint8Array() };
            return;
          }
        } catch {
          // ignore malformed data lines
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Export types for consumers
// ---------------------------------------------------------------------------

export type { ModelConfig };