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
  { id: 'direct:mijlai-pwr', name: 'MijlAI-PWR (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'sparkles', is_free: true },
  { id: 'direct:mijlai-mini', name: 'MijlAI-Mini (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'zap', is_free: false },
  { id: 'direct:mijlai-flash', name: 'MijlAI-Flash (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'sparkles', is_free: false },
  { id: 'direct:mijlai-pro', name: 'MijlAI-Pro (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'brain', is_free: false }
];

// NVIDIA / Kimi model layer — aggregated from nvidia-kimi-mcp,
// nvidia-kimi-bridge and kimi-super-agent-hybrid. Served through the NVIDIA NIM
// endpoint (build.nvidia.com). Keep in sync with src/models/tiers.ts (NVIDIA_TIERS).
export const NVIDIA_MODELS: ModelEntry[] = [
  { id: 'direct:nv-kimi-k3', name: 'Kimi K3 (Moonshot · NVIDIA NIM)', provider: 'nvidia', icon: 'sparkles', is_free: true, description: 'moonshotai/kimi-k3 — reasoning flagship' },
  { id: 'direct:nv-nemotron-3-ultra', name: 'Nemotron-3 Ultra 550B (NVIDIA)', provider: 'nvidia', icon: 'brain', is_free: true, description: 'nvidia/nemotron-3-ultra-550b-a55b' },
  { id: 'direct:nv-nemotron-3-super', name: 'Nemotron-3 Super 120B (NVIDIA)', provider: 'nvidia', icon: 'brain', is_free: true, description: 'nvidia/nemotron-3-super-120b-a12b' },
  { id: 'direct:nv-nemotron-lightning', name: 'Nemotron-3.5 Lightning 30B (NVIDIA)', provider: 'nvidia', icon: 'zap', is_free: true, description: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
  { id: 'direct:nv-minimax-m3', name: 'MiniMax M3 (NVIDIA NIM)', provider: 'nvidia', icon: 'cpu', is_free: true, description: 'minimaxai/minimax-m3' },
  { id: 'direct:nv-gpt-oss-20b', name: 'GPT-OSS 20B (OpenAI · NVIDIA)', provider: 'nvidia', icon: 'cpu', is_free: true, description: 'openai/gpt-oss-20b' },
  { id: 'direct:nv-muse-glimmer', name: 'Muse Glimmer 30B (Meta · NVIDIA)', provider: 'nvidia', icon: 'sparkles', is_free: true, description: 'meta/muse-glimmer-30b' },
  { id: 'direct:nv-laguna', name: 'Laguna (Poolside · NVIDIA)', provider: 'nvidia', icon: 'cpu', is_free: true, description: 'poolside/laguna-xs-2.1 — code specialist' },
  { id: 'direct:nv-llama-3.2-vision', name: 'Llama 3.2 Vision (Meta · NVIDIA)', provider: 'nvidia', icon: 'eye', is_free: true, description: 'meta/llama-3.2-11b-vision-instruct' },
  { id: 'direct:nv-diffusiongemma', name: 'DiffusionGemma 26B (Google · NVIDIA)', provider: 'nvidia', icon: 'image', is_free: true, description: 'google/diffusiongemma-26b-a4b-it' },
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
  const all = [...WORKING_MODELS, ...NVIDIA_MODELS, ...localModels];
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
