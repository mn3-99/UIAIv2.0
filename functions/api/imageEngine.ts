/**
 * Smart Image Models Layer — طبقة نماذج الصور الذكية
 * =====================================================
 * مفاتيح على السيرفر فقط (ملفات providers/.mistral_key / .alibaba_zen_key / .manus_key).
 * سلسلةFallback ذكية: Mistral → Manus → Zen.
 * pollinations حُذف لانه يُعيد صورة واحدة مكررة مهما تغير البرومبت.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type ImageProvider = 'zen' | 'mistral' | 'manus';

export interface ImageModelDef {
  id: string;
  label: string;
  provider: ImageProvider;
  upstreamModel: string;
  avgSeconds?: number;
  tier: 'pro' | 'standard' | 'fast';
  requiresKey?: boolean;
}

export interface ImageGenOptions {
  width?: number;
  height?: number;
  n?: number;
  negativePrompt?: string;
  seed?: number;
}

export interface ImageGenResult {
  url: string;
  width?: number;
  height?: number;
  model: string;
  label: string;
  provider: ImageProvider;
  elapsed_ms: number;
  fallback: boolean;
}

const ZEN_WORKSPACE = process.env.ALIBABA_ZEN_WORKSPACE || 'ws-kypx0fmfdbfb9ho5';
const ZEN_BASE = `https://${ZEN_WORKSPACE}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;

function readKey(cache: { v: string | null | undefined }, envVars: string[], fileNames: string[]): string | null {
  if (cache.v !== undefined) return cache.v;
  for (const ev of envVars) {
    const k = (process.env[ev] || '').trim();
    if (k) { cache.v = k; return k; }
  }
  for (const fn of fileNames) {
    try {
      const p = join(process.cwd(), 'providers', fn);
      if (existsSync(p)) { cache.v = readFileSync(p, 'utf-8').trim().split('\n')[0]; return cache.v; }
    } catch { /* ignore */ }
  }
  cache.v = null;
  return null;
}

function readKeys(fileNames: string[]): string[] {
  for (const fn of fileNames) {
    try {
      const p = join(process.cwd(), 'providers', fn);
      if (existsSync(p)) {
        return readFileSync(p, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
      }
    } catch { /* ignore */ }
  }
  return [];
}

const zenKey = { v: undefined as string | null | undefined };
const mistralKey = { v: undefined as string | null | undefined };

function getZenKey(): string | null { return readKey(zenKey, ['ALIBABA_ZEN_KEY', 'DASHSCOPE_API_KEY'], ['.alibaba_zen_key']); }
function getMistralKey(): string | null { return readKey(mistralKey, ['MISTRAL_API_KEY'], ['.mistral_key']); }
function getManusKeys(): string[] {
  const envKey = (process.env.MANUS_API_KEY || '').trim();
  const fileKeys = readKeys(['.manus_keys', '.manus_key']);
  const all = envKey ? [envKey, ...fileKeys] : fileKeys;
  return [...new Set(all)];
}

let manusIdx = 0;

/**
 * نماذج الصور المتاحة — سلسلةFallback:
 * 1) Mistral (Black Forest Labs Flux عبر chat completions)
 * 2) Manus.ai (وكيل ذكي يولّد صور)
 * 3) Zen (Alibaba qwen-image — يحتاج مفتاح)
 */
export const VERIFIED_IMAGE_MODELS: ImageModelDef[] = [
  { id: 'mistral', label: 'Mistral Flux', provider: 'mistral', upstreamModel: 'mistral-medium-latest', avgSeconds: 15, tier: 'standard', requiresKey: true },
  { id: 'manus', label: 'Manus AI', provider: 'manus', upstreamModel: 'manus-1.6', avgSeconds: 30, tier: 'pro', requiresKey: true },
  { id: 'qi2', label: 'MijlAI صور (Zen)', provider: 'zen', upstreamModel: 'qwen-image-2.0', avgSeconds: 8.7, tier: 'fast', requiresKey: true },
  { id: 'qi2-pro', label: 'MijlAI صور قياسي', provider: 'zen', upstreamModel: 'qwen-image-2.0-pro', avgSeconds: 35.0, tier: 'standard', requiresKey: true },
  { id: 'qi3', label: 'MijlAI صور احترافي', provider: 'zen', upstreamModel: 'qwen-image-3.0', avgSeconds: 65.7, tier: 'pro', requiresKey: true },
];

function hasKeyFor(p: ImageProvider): boolean {
  if (p === 'zen') return !!getZenKey();
  if (p === 'mistral') return !!getMistralKey();
  if (p === 'manus') return getManusKeys().length > 0;
  return false;
}

export async function listVerifiedImageModels() {
  return VERIFIED_IMAGE_MODELS.map(({ id, label, tier, avgSeconds, provider, requiresKey }) => ({
    id, label, tier, avgSeconds, provider,
    requiresKey: !!requiresKey,
    keyConfigured: !requiresKey || hasKeyFor(provider),
  }));
}

interface RawImageResult { url: string; width?: number; height?: number; }

async function generateViaMistral(_model: string, prompt: string, opts: ImageGenOptions): Promise<RawImageResult> {
  const key = getMistralKey();
  if (!key) throw new Error('MISTRAL_KEY_MISSING');
  const p = opts.negativePrompt ? `${prompt}. Avoid: ${opts.negativePrompt}` : prompt;
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistral-medium-latest',
      messages: [{ role: 'user', content: `Generate an image: ${p}` }],
      tools: [{ type: 'image_generation' }],
    }),
  });
  if (!res.ok) throw new Error(`mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  for (const choice of data?.choices || []) {
    for (const msg of choice?.messages || []) {
      for (const tc of msg?.tool_calls || []) {
        const args = typeof tc?.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc?.function?.arguments;
        if (args?.url) return { url: args.url, width: opts.width || 1024, height: opts.height || 1024 };
      }
      if (msg.role === 'tool' && msg.content) {
        try {
          const r = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          if (r?.url) return { url: r.url, width: opts.width || 1024, height: opts.height || 1024 };
        } catch { /* ignore */ }
      }
      const content = msg?.content;
      if (Array.isArray(content)) {
        const img = content.find((c: any) => c?.type === 'image_url' && c?.image_url);
        if (img?.image_url) return { url: img.image_url, width: opts.width || 1024, height: opts.height || 1024 };
      }
    }
  }
  throw new Error('mistral: no image in response');
}

async function generateViaManusWithKey(key: string, prompt: string, opts: ImageGenOptions): Promise<RawImageResult> {
  const p = opts.negativePrompt ? `${prompt}. Avoid: ${opts.negativePrompt}` : prompt;
  const createRes = await fetch('https://api.manus.ai/v2/task.create', {
    method: 'POST',
    headers: { 'x-manus-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { content: `Generate an image: ${p}. Return ONLY the image URL, nothing else.` }, hide_in_task_list: true }),
  });
  if (!createRes.ok) throw new Error(`manus create ${createRes.status}: ${(await createRes.text()).slice(0, 200)}`);
  const created: any = await createRes.json();
  if (!created.ok) throw new Error(`manus: ${created.error?.message || 'task creation failed'}`);
  const taskId = created.task_id;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const msgRes = await fetch(`https://api.manus.ai/v2/task.listMessages?task_id=${taskId}`, {
      headers: { 'x-manus-api-key': key },
    });
    if (!msgRes.ok) continue;
    const msgData: any = await msgRes.json();
    for (const m of msgData?.messages || []) {
      const assistant = m?.assistant_message;
      if (assistant?.content) {
        const urlMatch = assistant.content.match(/https?:\/\/[^\s)"]+\.(png|jpg|jpeg|webp|gif)/i);
        if (urlMatch) return { url: urlMatch[0], width: opts.width || 1024, height: opts.height || 1024 };
        const anyUrl = assistant.content.match(/https?:\/\/[^\s)"]+/);
        if (anyUrl && !anyUrl[0].includes('manus.im/app')) return { url: anyUrl[0], width: opts.width || 1024, height: opts.height || 1024 };
      }
    }
  }
  throw new Error('manus: timeout waiting for image');
}

async function generateViaManus(prompt: string, opts: ImageGenOptions): Promise<RawImageResult> {
  const keys = getManusKeys();
  if (!keys.length) throw new Error('MANUS_KEY_MISSING');
  let lastErr: any = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(manusIdx + i) % keys.length];
    try {
      const result = await generateViaManusWithKey(key, prompt, opts);
      manusIdx = (manusIdx + i + 1) % keys.length;
      return result;
    } catch (err: any) {
      console.warn(`[manus] key ...${key.slice(-8)} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('manus: all keys failed');
}

async function generateViaZen(model: string, prompt: string, opts: ImageGenOptions): Promise<RawImageResult> {
  const key = getZenKey();
  if (!key) throw new Error('ZEN_KEY_MISSING');
  const res = await fetch(ZEN_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: {
        size: `${opts.width || 1024}*${opts.height || 1024}`,
        n: Math.min(Math.max(opts.n || 1, 1), 6),
        negative_prompt: opts.negativePrompt || '',
        prompt_extend: true, watermark: false,
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`zen ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  if (data?.code) throw new Error(`zen: ${data.code} ${data.message || ''}`.slice(0, 200));
  const parts: any[] = data?.output?.choices?.[0]?.message?.content || [];
  const found = parts.find((p: any) => p?.image) || parts.find((p: any) => typeof p === 'string');
  const url = typeof found === 'string' ? found : found?.image;
  if (!url) throw new Error('zen: no image in response');
  return { url, width: opts.width || 1024, height: opts.height || 1024 };
}

function buildOrder(): ImageModelDef[] {
  const order: ImageModelDef[] = [];
  if (hasKeyFor('mistral')) order.push(...VERIFIED_IMAGE_MODELS.filter(m => m.provider === 'mistral'));
  if (hasKeyFor('manus')) order.push(...VERIFIED_IMAGE_MODELS.filter(m => m.provider === 'manus'));
  if (hasKeyFor('zen')) order.push(...VERIFIED_IMAGE_MODELS.filter(m => m.provider === 'zen'));
  return order;
}

export async function generateImageSmart(modelId: string, prompt: string, opts: ImageGenOptions = {}): Promise<ImageGenResult> {
  const def = VERIFIED_IMAGE_MODELS.find(m => m.id === modelId);
  const started = Date.now();
  const order = buildOrder();
  if (!order.length) throw new Error('لا توجد مفاتيح صور مخدمة — أضف MISTRAL_API_KEY أو MANUS_API_KEY');
  const tryOrder = def && order.find(m => m.id === def.id)
    ? [def, ...order.filter(m => m.id !== def.id)]
    : order;
  let lastErr: any = null;
  for (const m of tryOrder) {
    try {
      const result = m.provider === 'mistral'
        ? await generateViaMistral(m.upstreamModel, prompt, opts)
        : m.provider === 'manus'
          ? await generateViaManus(prompt, opts)
          : await generateViaZen(m.upstreamModel, prompt, opts);
      return {
        ...result,
        model: m.id,
        label: m.label,
        provider: m.provider,
        elapsed_ms: Date.now() - started,
        fallback: def ? m.id !== def.id : false,
      };
    } catch (err: any) {
      console.warn(`[imageEngine] ${m.id} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error('فشل توليد الصورة من كل المزوّدين');
}
