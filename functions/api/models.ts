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
  { id: 'gemini', name: 'Gemini (Fast)', provider: 'google', icon: 'zap', is_free: true },
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai', icon: 'sparkles', is_free: false },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', provider: 'google', icon: 'zap', is_free: true },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'google', icon: 'zap', is_free: true },
  { id: 'gemini-auto', name: 'Gemini Auto', provider: 'google', icon: 'zap', is_free: true },
  { id: 'command-a', name: 'Command A', provider: 'cohere', icon: 'sparkles', is_free: true },
  { id: 'aria', name: 'Aria', provider: 'rhymes', icon: 'sparkles', is_free: true }
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
