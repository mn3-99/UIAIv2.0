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
  { id: 'gpt-4o-mini', name: 'MijlAi Mini (GPT-Mini · Yqcloud · 198tok/s)', provider: 'yqcloud', icon: 'zap', is_free: true },
  { id: 'sonar', name: 'MijlAi Flash (Sonar · Perplexity · 1.9s TTFT)', provider: 'perplexity', icon: 'sparkles', is_free: true },
  { id: 'gemini', name: 'MijlAi Pro (Gemini · Google · 158tok/s)', provider: 'google', icon: 'brain', is_free: true },
  { id: 'direct:Qwen3-Coder-30B-A3B-Instruct', name: 'MijlAi Coder (Qwen3-Coder-30B · OVHcloud · 0.4s TTFT)', provider: 'ovhcloud', icon: 'code', is_free: true }
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
