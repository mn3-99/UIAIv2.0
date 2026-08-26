/**
 * Smart Image Models Layer — طبقة نماذج الصور الذكية
 * =====================================================
 * - المفاتيح تبقى على السيرفر فقط (تُقرأ من ملف providers/.alibaba_zen_key).
 * - النماذج المدرجة هنا اجتازت اختبار 5/5 صور حقيقية (tests/image_models_test.json).
 * - التوجيه: zen (Alibaba Model Studio عبر chat-completions) أو pollinations (بدون مفتاح).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export interface ImageModelDef {
  id: string;
  label: string;
  provider: 'zen' | 'pollinations';
  upstreamModel: string;
  avgSeconds?: number;
  tier: 'pro' | 'standard' | 'fast';
}

let zenKeyCache: string | null = null;
function getZenKey(): string {
  if (zenKeyCache) return zenKeyCache;
  // الأولوية لمتغير البيئة، ثم ملف المفتاح على السيرفر
  const envKey = process.env.ALIBABA_ZEN_KEY?.trim();
  if (envKey) {
    zenKeyCache = envKey;
    return envKey;
  }
  const keyFile = join(process.cwd(), 'providers', '.alibaba_zen_key');
  zenKeyCache = readFileSync(keyFile, 'utf-8').trim();
  return zenKeyCache;
}

const ZEN_BASE = 'https://ws-kypx0fmfdbfb9ho5.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions';

/**
 * نماذج موثقة باختبار 5/5 صور حقيقية (2026-08-27 — tests/image_models_results.jsonl).
 * المستبعدون بالقاعدة الصارمة: wan2.7-image(-pro), z-image-turbo, qwen-image-max/plus
 * (لا يعيدون صورة عبر هذا المسار) وpollinations sana (4/5 — فشل واحد 500).
 */
export const VERIFIED_IMAGE_MODELS: ImageModelDef[] = [
  { id: 'qi2', label: 'MijlAI صور سريع', provider: 'zen', upstreamModel: 'qwen-image-2.0', avgSeconds: 8.7, tier: 'fast' },
  { id: 'qi2-pro', label: 'MijlAI صور قياسي', provider: 'zen', upstreamModel: 'qwen-image-2.0-pro', avgSeconds: 35.0, tier: 'standard' },
  { id: 'qi3', label: 'MijlAI صور احترافي', provider: 'zen', upstreamModel: 'qwen-image-3.0', avgSeconds: 65.7, tier: 'pro' },
  { id: 'qi3-pro', label: 'MijlAI صور فائق', provider: 'zen', upstreamModel: 'qwen-image-3.0-pro', avgSeconds: 57.1, tier: 'pro' },
];

export async function listVerifiedImageModels() {
  return VERIFIED_IMAGE_MODELS.map(({ id, label, tier, avgSeconds }) => ({ id, label, tier, avgSeconds }));
}

interface ZenImageResult {
  url: string;
  width?: number;
  height?: number;
}

async function generateViaZen(model: string, prompt: string): Promise<ZenImageResult> {
  const res = await fetch(ZEN_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getZenKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      stream: false,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`zen ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (data?.code) throw new Error(`zen: ${data.code} ${data.message || ''}`.slice(0, 200));
  const parts = data?.output?.choices?.[0]?.message?.content || [];
  const img = parts.find((p: any) => p?.image);
  if (!img?.image) throw new Error('zen: no image in response');
  return { url: img.image, width: data?.usage?.width, height: data?.usage?.height };
}

function generateViaPollinations(model: string, prompt: string, width: number, height: number): ZenImageResult {
  const params = new URLSearchParams({
    model,
    width: String(width),
    height: String(height),
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1_000_000)),
  });
  return { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}` };
}

export async function generateImageSmart(modelId: string, prompt: string, width = 1024, height = 1024) {
  const def = VERIFIED_IMAGE_MODELS.find(m => m.id === modelId) || VERIFIED_IMAGE_MODELS[0];
  if (!def) throw new Error('لا توجد نماذج صور موثقة متاحة');
  const started = Date.now();
  const result = def.provider === 'zen'
    ? await generateViaZen(def.upstreamModel, prompt)
    : generateViaPollinations(def.upstreamModel, prompt, width, height);
  return {
    ...result,
    model: def.id,
    label: def.label,
    elapsed_ms: Date.now() - started,
  };
}
