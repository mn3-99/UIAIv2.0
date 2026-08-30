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
  const all = [...WORKING_MODELS, ...localModels];
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
