/**
 * Smart Image Models Layer — طبقة نماذج الصور الذكية
 * =====================================================
 * - المفاتيح تبقى على السيرفر فقط (متغيّر البيئة ALIBABA_ZEN_KEY / DASHSCOPE_API_KEY
 *   أو ملف providers/.alibaba_zen_key).
 * - طبقتان: zen (Alibaba Model Studio / DashScope qwen-image) و pollinations (بدون مفتاح).
 * - كل النماذج تمر عبر generateImageSmart التي تعود تلقائياً لأي مزوّد يعمل، لضمان
 *   أن يرى المستخدم صورة دائماً حتى لو تعذّر المزوّد المفضّل.
 *
 * ملاحظة مهمة (2026-08): نماذج الصور في DashScope لا تدعم واجهة OpenAI-compatible
 * (compatible-mode/v1/chat/completions). المسار الصحيح هو الواجهة الأصلية:
 *   /api/v1/services/aigc/multimodal-generation/generation
 * ويُعاد الرابط داخل data.output.choices[0].message.content[].image
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type ImageProvider = 'zen' | 'pollinations';

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

const ZEN_WORKSPACE = process.env.ALIBABA_ZEN_WORKSPACE
  || 'ws-kypx0fmfdbfb9ho5';
const ZEN_BASE = `https://${ZEN_WORKSPACE}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;

let zenKeyCache: string | null | undefined = undefined;
function getZenKey(): string | null {
  if (zenKeyCache !== undefined) return zenKeyCache;
  const envKey = (process.env.ALIBABA_ZEN_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  if (envKey) { zenKeyCache = envKey; return envKey; }
  const keyFile = join(process.cwd(), 'providers', '.alibaba_zen_key');
  try {
    if (existsSync(keyFile)) { zenKeyCache = readFileSync(keyFile, 'utf-8').trim(); return zenKeyCache; }
  } catch { /* ignore */ }
  zenKeyCache = null;
  return null;
}

/**
 * نماذج موثّقة (2026-08).
 * - pollinations (flux/turbo): تعمل بدون مفتاح دائماً — خيار احتياطي وموثوق.
 * - zen (qwen-image 2.0 / 3.0): جودة أعلى لكنها تتطلب مفتاح خادم.
 * عند غياب المفتاح يعود المحرّك تلقائياً إلى pollinations.
 */
export const VERIFIED_IMAGE_MODELS: ImageModelDef[] = [
  { id: 'flux', label: 'Flux سريع (مجاني)', provider: 'pollinations', upstreamModel: 'flux', avgSeconds: 12, tier: 'fast' },
  { id: 'turbo', label: 'Turbo خفيف (مجاني)', provider: 'pollinations', upstreamModel: 'turbo', avgSeconds: 6, tier: 'fast' },
  { id: 'qi2', label: 'MijlAI صور سريع', provider: 'zen', upstreamModel: 'qwen-image-2.0', avgSeconds: 8.7, tier: 'fast', requiresKey: true },
  { id: 'qi2-pro', label: 'MijlAI صور قياسي', provider: 'zen', upstreamModel: 'qwen-image-2.0-pro', avgSeconds: 35.0, tier: 'standard', requiresKey: true },
  { id: 'qi3', label: 'MijlAI صور احترافي', provider: 'zen', upstreamModel: 'qwen-image-3.0', avgSeconds: 65.7, tier: 'pro', requiresKey: true },
  { id: 'qi3-pro', label: 'MijlAI صور فائق', provider: 'zen', upstreamModel: 'qwen-image-3.0-pro', avgSeconds: 57.1, tier: 'pro', requiresKey: true },
];

export async function listVerifiedImageModels() {
  return VERIFIED_IMAGE_MODELS.map(({ id, label, tier, avgSeconds, provider, requiresKey }) => ({
    id,
    label,
    tier,
    avgSeconds,
    provider,
    requiresKey: !!requiresKey,
    keyConfigured: provider === 'zen' ? !!getZenKey() : true,
  }));
}

interface ZenImageResult {
  url: string;
  width?: number;
  height?: number;
}

async function generateViaZen(model: string, prompt: string, opts: ImageGenOptions): Promise<ZenImageResult> {
  const key = getZenKey();
  if (!key) throw new Error('ZEN_KEY_MISSING');
  const width = opts.width || 1024;
  const height = opts.height || 1024;
  const res = await fetch(ZEN_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
      },
      parameters: {
        size: `${width}*${height}`,
        n: Math.min(Math.max(opts.n || 1, 1), 6),
        negative_prompt: opts.negativePrompt || '',
        prompt_extend: true,
        watermark: false,
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`zen ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (data?.code) throw new Error(`zen: ${data.code} ${data.message || ''}`.slice(0, 200));
  const parts: any[] = data?.output?.choices?.[0]?.message?.content || [];
  const found = parts.find((p: any) => p?.image) || parts.find((p: any) => typeof p === 'string');
  const url = typeof found === 'string' ? found : found?.image;
  if (!url) throw new Error('zen: no image in response');
  return { url, width, height };
}

function generateViaPollinations(model: string, prompt: string, opts: ImageGenOptions): ZenImageResult {
  const width = opts.width || 1024;
  const height = opts.height || 1024;
  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: 'true',
    seed: String(opts.seed ?? Math.floor(Math.random() * 1_000_000)),
  });
  return { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`, width, height };
}

function buildOrder(def: ImageModelDef): ImageModelDef[] {
  const hasKey = !!getZenKey();
  const order: ImageModelDef[] = [];
  if (hasKey || def.provider !== 'zen') order.push(def);
  const keyless = VERIFIED_IMAGE_MODELS.filter(m => m.provider === 'pollinations' && m.id !== def.id);
  order.push(...keyless);
  if (hasKey) order.push(...VERIFIED_IMAGE_MODELS.filter(m => m.provider === 'zen' && m.id !== def.id));
  return order;
}

export async function generateImageSmart(modelId: string, prompt: string, opts: ImageGenOptions = {}): Promise<ImageGenResult> {
  const def = VERIFIED_IMAGE_MODELS.find(m => m.id === modelId) || VERIFIED_IMAGE_MODELS[0];
  if (!def) throw new Error('لا توجد نماذج صور موثقة متاحة');
  const started = Date.now();
  let lastErr: any = null;
  for (const m of buildOrder(def)) {
    try {
      const result = m.provider === 'zen'
        ? await generateViaZen(m.upstreamModel, prompt, opts)
        : generateViaPollinations(m.upstreamModel, prompt, opts);
      return {
        ...result,
        model: m.id,
        label: m.label,
        provider: m.provider,
        elapsed_ms: Date.now() - started,
        fallback: m.id !== def.id,
      };
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('فشل توليد الصورة من كل المزوّدين');
}
