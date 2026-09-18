import type { Request, Response } from 'express';
import { toModelEntries } from './localModels';

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  icon?: string;
  is_free?: boolean;
  description?: string;
}

export const WORKING_MODELS: ModelEntry[] = [
  { id: 'direct:mijlai-pwr', name: 'MijlAI-PWR (وكيل مخصص · Kilo Bridge)', provider: 'kilo', icon: 'sparkles', is_free: true },
  { id: 'direct:mijlai-mini', name: 'MijlAI-Mini (وكيل مخصص · Kilo Bridge)', provider: 'kilo', icon: 'zap', is_free: true },
  { id: 'direct:mijlai-flash', name: 'MijlAI-Flash (وكيل مخصص · Kilo Bridge)', provider: 'kilo', icon: 'sparkles', is_free: true },
  { id: 'direct:mijlai-pro', name: 'MijlAI-Pro (وكيل مخصص · Kilo Bridge)', provider: 'kilo', icon: 'brain', is_free: true },
  { id: 'direct:mijlai-lalo-fast', name: 'MijlAI-lalo-fast (مجاني · DS Chat)', provider: 'session-bridge', icon: 'zap', is_free: true },
  { id: 'direct:kilo', name: 'Kilo Free (نماذج مجانية · Kilo.ai)', provider: 'kilo', icon: 'zap', is_free: true },
  { id: 'direct:apitoken', name: 'LFM 2.5 8B (apitoken · Keyless)', provider: 'apitoken', icon: 'brain', is_free: true },
  { id: 'direct:pollinations', name: 'Pollinations (GPT · Keyless)', provider: 'pollinations', icon: 'sparkles', is_free: true },
  { id: 'direct:ovhcloud', name: 'OVHcloud (Qwen3-Coder 30B · Keyless)', provider: 'ovhcloud', icon: 'code', is_free: true },
];
// Image Generation Models
export const IMAGE_MODELS: ModelEntry[] = [
  { id: 'direct:flux', name: 'Flux (Pollinations)', provider: 'pollinations', icon: 'palette', is_free: true, description: 'Flux Schnell · Pollinations' },
  { id: 'direct:flux-pro', name: 'Flux Pro', provider: 'pollinations', icon: 'palette', is_free: true, description: 'flux-pro · Pollinations' },
  { id: 'direct:flux-dev', name: 'Flux Dev', provider: 'pollinations', icon: 'palette', is_free: true, description: 'flux-dev · Pollinations' },
  { id: 'direct:sdxl', name: 'SDXL', provider: 'pollinations', icon: 'palette', is_free: true, description: 'sdxl · Pollinations' },
  { id: 'direct:midjourney', name: 'Midjourney v6', provider: 'pollinations', icon: 'palette', is_free: true, description: 'midjourney · Pollinations' },
  { id: 'direct:dalle3', name: 'DALL-E 3', provider: 'pollinations', icon: 'palette', is_free: true, description: 'dalle3 · Pollinations' },
  { id: 'direct:gptimage', name: 'GPT-Image-1', provider: 'pollinations', icon: 'palette', is_free: true, description: 'gptimage · Pollinations' },
  { id: 'direct:ideogram', name: 'Ideogram v2', provider: 'pollinations', icon: 'palette', is_free: true, description: 'ideogram · Pollinations' },
  { id: 'direct:playground', name: 'Playground v2.5', provider: 'pollinations', icon: 'palette', is_free: true, description: 'playground · Pollinations' },
  { id: 'direct:mistral-image', name: 'Mistral Flux', provider: 'mistral', icon: 'brain', is_free: false, description: 'mistral-medium-latest · Mistral AI' },
  { id: 'direct:manus-image', name: 'Manus AI Image', provider: 'manus', icon: 'sparkles', is_free: false, description: 'manus-1.6 · Manus AI' },
  { id: 'direct:zen-image', name: 'Zen (Qwen-Image)', provider: 'zen', icon: 'image', is_free: false, description: 'qwen-image-2.0 · Alibaba Cloud' },
  { id: 'direct:zen-pro', name: 'Zen Pro (Qwen-Image Pro)', provider: 'zen', icon: 'image', is_free: false, description: 'qwen-image-2.0-pro · Alibaba Cloud' },
  { id: 'direct:zen-3', name: 'Zen 3 (Qwen-Image 3.0)', provider: 'zen', icon: 'image', is_free: false, description: 'qwen-image-3.0 · Alibaba Cloud' },
];
// Session-bridge layer — web-session models (no official keys) via the local
// OpenAI-compatible gateway on 127.0.0.1:8791. Sorted fastest→slowest.
// Keep in sync with src/models/tiers.ts (SESSION_TIERS).
export const SESSION_MODELS: ModelEntry[] = [
  { id: 'direct:sb-deepseek-chat', name: 'DeepSeek Chat (Session)', provider: 'session', icon: 'zap', is_free: true, description: 'deepseek-chat · session bridge · الأسرع' },
  { id: 'direct:sb-deepseek-reasoner', name: 'DeepSeek Reasoner (Session)', provider: 'session', icon: 'brain', is_free: true, description: 'deepseek-reasoner · تفكير عميق' },
  { id: 'direct:sb-duck-oss', name: 'GPT-OSS 120B (Duck Session)', provider: 'session', icon: 'cpu', is_free: true, description: 'duck-oss · gpt-oss 120B' },
  { id: 'direct:sb-duck-mistral', name: 'Mistral Small 4 (Duck Session)', provider: 'session', icon: 'layers', is_free: true, description: 'duck-mistral' },
  { id: 'direct:sb-duck-gpt-mini', name: 'GPT-5.4 mini (Duck Session)', provider: 'session', icon: 'zap', is_free: true, description: 'duck-gpt-mini' },
  { id: 'direct:sb-duck-gemma', name: 'Gemma 4 31B (Duck Session)', provider: 'session', icon: 'sparkles', is_free: true, description: 'duck-gemma' },
  { id: 'direct:sb-duck-haiku', name: 'Claude Haiku 4.5 (Duck Session)', provider: 'session', icon: 'flask-conical', is_free: true, description: 'duck-haiku · الأذكى' },
  { id: 'direct:sb-duck-luna', name: 'GPT-5.6 Luna (Duck Session)', provider: 'session', icon: 'rocket', is_free: true, description: 'duck-luna · يومي' },
  { id: 'direct:sb-qwen', name: 'Qwen3.7-Plus (Session)', provider: 'session', icon: 'code', is_free: true, description: 'qwen3.7-plus · قوي لكن أبطأ' },
  { id: 'direct:sb-kimi-k3', name: 'Kimi K3 Web (Session)', provider: 'session', icon: 'sparkles', is_free: true, description: 'kimi-k3 · kimi-web bridge · تفكير عميق' },
  { id: 'direct:sb-kimi-k2.6', name: 'Kimi K2.6 Web (Session)', provider: 'session', icon: 'sparkles', is_free: true, description: 'kimi-k2.6 · kimi-web bridge' },
  { id: 'direct:sb-kimi-code', name: 'Kimi Coder Web (Session)', provider: 'session', icon: 'code', is_free: true, description: 'kimi-k2.7-code · kimi-web bridge' },
];
// NVIDIA / Kimi model layer — aggregated from nvidia-kimi-mcp,
// nvidia-kimi-bridge and kimi-super-agent-hybrid. Served through the NVIDIA NIM
// endpoint (build.nvidia.com) via local captcha bridge (keyless).
// Keep in sync with src/models/tiers.ts (NVIDIA_TIERS).
export const NVIDIA_MODELS: ModelEntry[] = [
  { id: 'direct:nv-nemotron-3-ultra', name: 'Nemotron-3 Ultra 550B (NVIDIA Bridge)', provider: 'nvidia', icon: 'brain', is_free: true, description: 'nvidia/nemotron-3-ultra-550b-a55b' },
  { id: 'direct:nv-nemotron-3-super', name: 'Nemotron-3 Super 120B (NVIDIA Bridge)', provider: 'nvidia', icon: 'brain', is_free: true, description: 'nvidia/nemotron-3-super-120b-a12b' },
  { id: 'direct:nv-nemotron-lightning', name: 'Nemotron 3.5 Lightning 30B (NVIDIA Bridge)', provider: 'nvidia', icon: 'zap', is_free: true, description: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
  { id: 'direct:nv-muse-glimmer', name: 'Muse Glimmer 30B (NVIDIA Bridge)', provider: 'nvidia', icon: 'sparkles', is_free: true, description: 'meta/muse-glimmer-30b' },
  { id: 'direct:nv-gpt-oss-20b', name: 'GPT-OSS 20B (NVIDIA Bridge)', provider: 'nvidia', icon: 'brain', is_free: true, description: 'openai/gpt-oss-20b' },
  { id: 'direct:nv-laguna', name: 'Poolside Laguna XS 2.1 (NVIDIA Bridge)', provider: 'nvidia', icon: 'code', is_free: true, description: 'poolside/laguna-xs-2.1' },
  { id: 'direct:nv-minimax-m3', name: 'MiniMax M3 (NVIDIA Bridge)', provider: 'nvidia', icon: 'rocket', is_free: true, description: 'minimaxai/minimax-m3' },
  { id: 'direct:nv-kimi-k3', name: 'Kimi K3 - Moonshot (NVIDIA Bridge)', provider: 'nvidia', icon: 'sparkles', is_free: true, description: 'moonshotai/kimi-k3' },
  { id: 'direct:nv-llama-vision', name: 'Llama 3.2 Vision 11B (NVIDIA Bridge)', provider: 'nvidia', icon: 'image', is_free: true, description: 'meta/llama-3.2-11b-vision-instruct' },
  { id: 'direct:nv-diffusiongemma', name: 'DiffusionGemma 26B (NVIDIA Bridge)', provider: 'nvidia', icon: 'flask-conical', is_free: true, description: 'google/diffusiongemma-26b-a4b-it' },
];

const MHMODIJLA_URL = process.env.MHMODIJLA_API_URL || '';
let mhmodijlaCache: ModelEntry | null = null;
let mhmodijlaCacheAt = 0;

export async function fetchMhmodijlaModel(): Promise<ModelEntry | null> {
  if (!MHMODIJLA_URL) return null;
  if (mhmodijlaCache && Date.now() - mhmodijlaCacheAt < 60_000) return mhmodijlaCache;
  try {
    const res = await fetch(`${MHMODIJLA_URL}/v1/models`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const models = data?.data || [];
    const first = models[0];
    if (!first?.id) return null;
    const host = MHMODIJLA_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const entry: ModelEntry = {
      id: `mhmodijla:${first.id}`,
      name: first.id,
      provider: first.owned_by || 'mhmodijla',
      icon: 'cpu',
      is_free: true,
      description: `${first.owned_by || 'MijlAI'} · ${host}`,
    };
    mhmodijlaCache = entry;
    mhmodijlaCacheAt = Date.now();
    return entry;
  } catch {
    return null;
  }
}

export async function getAggregatedModels(forceRefresh = false): Promise<ModelEntry[]> {
  const localModels = await toModelEntries(forceRefresh);
  const remote = await fetchMhmodijlaModel();
  const all = [...WORKING_MODELS, ...SESSION_MODELS, ...NVIDIA_MODELS, ...localModels];
  if (remote) all.push(remote);
  return all;
}

export async function handleModelsRequest(req: Request, res: Response) {
  try {
    const models = await getAggregatedModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to aggregate models', details: err?.message });
  }
}
