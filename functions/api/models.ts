import type { Request, Response } from 'express';

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  icon?: string;
  is_free?: boolean;
}

export const KNOWN_FREE_G4F_MODELS: ModelEntry[] = [
  // Grok Models
  { id: 'g4f:grok-beta', name: 'MijlAI_grok-beta', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:grok-2', name: 'MijlAI_grok-2', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:grok-3', name: 'MijlAI_grok-3', provider: 'g4f', icon: 'sparkles', is_free: true },

  // Claude Models
  { id: 'g4f:claude-3.7-sonnet', name: 'MijlAI_claude-3.7-sonnet', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:claude-3.5-sonnet', name: 'MijlAI_claude-3.5-sonnet', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:claude-3.5-haiku', name: 'MijlAI_claude-3.5-haiku', provider: 'g4f', icon: 'sparkles', is_free: true },

  // Kimi & Moonshot Models
  { id: 'g4f:kimi-k3', name: 'MijlAI_kimi-k3', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:kimi-k1.5', name: 'MijlAI_kimi-k1.5', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:kimi', name: 'MijlAI_kimi-chat', provider: 'g4f', icon: 'sparkles', is_free: true },

  // OpenAI & Reasoning Models
  { id: 'g4f:gpt-4o', name: 'MijlAI_gpt-4o', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:gpt-4o-mini', name: 'MijlAI_gpt-4o-mini', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:gpt-4', name: 'MijlAI_gpt-4-turbo', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:o1', name: 'MijlAI_o1-reasoning', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:o3-mini', name: 'MijlAI_o3-mini', provider: 'g4f', icon: 'sparkles', is_free: true },

  // DeepSeek Models
  { id: 'g4f:deepseek-r1', name: 'MijlAI_deepseek-r1', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:deepseek-v3', name: 'MijlAI_deepseek-v3', provider: 'g4f', icon: 'sparkles', is_free: true },

  // Gemini Models via g4f
  { id: 'g4f:gemini-2.5-flash', name: 'MijlAI_gemini-2.5-flash', provider: 'g4f', icon: 'sparkles', is_free: true },
  { id: 'g4f:gemini-1.5-pro', name: 'MijlAI_gemini-1.5-pro', provider: 'g4f', icon: 'sparkles', is_free: true }
];


export const BUILTIN_MODELS: ModelEntry[] = [];

const G4F_SERVICE_URL = 'http://127.0.0.1:5050';

let cachedAggregatedModels: ModelEntry[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache TTL for responsive status updates

/**
 * Dynamically aggregate and validate G4F models from backend service or fallback cache
 */
export async function getAggregatedModels(forceRefresh = false): Promise<ModelEntry[]> {
  const now = Date.now();
  if (!forceRefresh && cachedAggregatedModels && (now - lastCacheTime) < CACHE_TTL_MS) {
    return cachedAggregatedModels;
  }

  let g4fModels: ModelEntry[] = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${G4F_SERVICE_URL}/models`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        // Only take validated responsive models returned by the provider service
        g4fModels = data.models.map((m: any) => {
          const rawName = m.name || m.id;
          const cleanName = rawName.startsWith('MijlAI_') ? rawName : `MijlAI_${rawName}`;
          return {
            id: m.id.startsWith('g4f:') ? m.id : `g4f:${m.id}`,
            name: cleanName,
            provider: 'g4f',
            icon: 'sparkles',
            is_free: true
          };
        });
      }
    }
  } catch (err) {
    // Service warming up or unavailable; fallback to default list
  }

  // Deduplicate responsive models
  const map = new Map<string, ModelEntry>();
  
  if (g4fModels.length > 0) {
    // Populate strictly validated active models from provider health check
    for (const m of g4fModels) {
      map.set(m.id, m);
    }
  } else {
    // Fallback catalog if provider status check is still initializing
    for (const m of KNOWN_FREE_G4F_MODELS) {
      map.set(m.id, m);
    }
  }

  const aggregatedG4F = Array.from(map.values());
  const fullList = [...aggregatedG4F, ...BUILTIN_MODELS];

  cachedAggregatedModels = fullList;
  lastCacheTime = now;

  return fullList;
}

// Background periodic checker loop to ensure active models stay continuously validated
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    getAggregatedModels(true).catch(() => {});
  }, CACHE_TTL_MS);
}

/**
 * Express Route Handler for /api/models & /api/v1/chat/models
 */
export async function handleModelsRequest(req: Request, res: Response) {
  try {
    const forceRefresh = req.query?.refresh === 'true' || req.query?.force === 'true';
    const models = await getAggregatedModels(forceRefresh);
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to aggregate models', details: err?.message });
  }
}
