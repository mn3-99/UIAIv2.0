import type { Request, Response } from 'express';
import { toModelEntries } from './localModels';

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  icon?: string;
  is_free?: boolean;
}

export const WORKING_MODELS: ModelEntry[] = [
  { id: 'direct:mijlai-pwr', name: 'MijlAI-PWR (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'sparkles', is_free: true },
  { id: 'direct:mijlai-mini', name: 'MijlAI-Mini (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'zap', is_free: false },
  { id: 'direct:mijlai-flash', name: 'MijlAI-Flash (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'sparkles', is_free: false },
  { id: 'direct:mijlai-pro', name: 'MijlAI-Pro (وكيل مخصص · DigitalOcean)', provider: 'digitalocean', icon: 'brain', is_free: false }
];

export async function getAggregatedModels(forceRefresh = false): Promise<ModelEntry[]> {
  const localModels = await toModelEntries(forceRefresh);
  return [...WORKING_MODELS, ...localModels];
}

export async function handleModelsRequest(req: Request, res: Response) {
  try {
    const models = await getAggregatedModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to aggregate models', details: err?.message });
  }
}
