import type { ModelEntry } from './models';

export interface LocalModelInfo {
  id: string;
  name: string;
  provider: string;
  icon?: string;
  is_free?: boolean;
  baseUrl: string;
  serverModel: string;
  port: number;
}

const DISCOVERY_TTL_MS = 30_000;

let localModelsCache: LocalModelInfo[] | null = null;
let localModelsCachedAt = 0;
let discoveryPromise: Promise<LocalModelInfo[]> | null = null;

function defaultProbePorts(): number[] {
  const env = process.env.LLAMA_CPP_PORTS;
  if (env && env.trim()) {
    return env
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  }
  return [8080, 8081, 8083];
}

async function probePort(port: number): Promise<LocalModelInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const baseUrl = `http://127.0.0.1:${port}`;
    const infos: LocalModelInfo[] = [];
    for (const m of models) {
      const serverModel = m?.id || m?.model || m?.name;
      if (!serverModel || typeof serverModel !== 'string') continue;
      const id = `local:${serverModel}`;
      const shortName = serverModel.split('/').pop()?.replace(/\.gguf$/i, '') || serverModel;
      infos.push({
        id,
        name: `${shortName} (محلي · llama.cpp)`,
        provider: 'llama',
        icon: 'cpu',
        is_free: true,
        baseUrl,
        serverModel,
        port
      });
    }
    if (infos.length === 0 && port === 8080) {
      // Debug aid: a live llama.cpp server that returned no usable model ids
      console.log(`[LocalModel] Port ${port} responded but exposed no model ids.`);
    }
    return infos;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverLocalModels(forceRefresh = false): Promise<LocalModelInfo[]> {
  if (!forceRefresh && localModelsCache && Date.now() - localModelsCachedAt < DISCOVERY_TTL_MS) {
    return localModelsCache;
  }
  if (discoveryPromise) return discoveryPromise;

  discoveryPromise = (async () => {
    const ports = defaultProbePorts();
    const results = await Promise.all(ports.map((port) => probePort(port)));
    const models = results.flat();
    localModelsCache = models;
    localModelsCachedAt = Date.now();
    return models;
  })();

  try {
    return await discoveryPromise;
  } finally {
    discoveryPromise = null;
  }
}

export function getLocalModelEndpoint(modelId: string): string | undefined {
  if (!localModelsCache) return undefined;
  const found = localModelsCache.find((m) => m.id === modelId || m.serverModel === modelId);
  return found?.baseUrl;
}

export function getLocalModelInfo(modelId: string): LocalModelInfo | undefined {
  if (!localModelsCache) return undefined;
  return localModelsCache.find((m) => m.id === modelId || m.serverModel === modelId);
}

export interface ResolvedLocalTarget {
  baseUrl: string;
  serverModel: string;
}

/**
 * Resolve the exact endpoint + server model id for a local model request.
 * Strategy: warm-cache lookup → force-refresh discovery once (ports may have been
 * busy during the first probe, e.g. while a big GGUF was still loading).
 * Unknown models return null so callers can fail with a clear error instead of
 * silently falling back to whatever is running on the default port.
 */
export async function resolveLocalTarget(modelId: string): Promise<ResolvedLocalTarget | null> {
  const clean = String(modelId).replace(/^local:/, '');

  // 1) Warm cache
  let info = getLocalModelInfo(modelId);
  // 2) Force refresh discovery if missing (once)
  if (!info) {
    try {
      await discoverLocalModels(true);
    } catch {
      // discovery never throws — it swallows per-port errors
    }
    info = getLocalModelInfo(modelId);
  }

  if (info && info.baseUrl && info.serverModel) {
    return { baseUrl: info.baseUrl, serverModel: info.serverModel };
  }

  // 3) Legacy hardcoded ids only (kept for local:qwen3.8-27b / local:muse-glimmer-30b).
  const knownLegacy = /^(qwen3\.8|qwen3\.8-27b|muse|glimmer|muse-glimmer-30b)/i.test(clean);
  if (knownLegacy) {
    if (clean.includes('muse') || clean.includes('glimmer')) {
      return { baseUrl: 'http://127.0.0.1:8081', serverModel: 'muse-glimmer-30b' };
    }
    return { baseUrl: 'http://127.0.0.1:8080', serverModel: clean };
  }

  return null;
}

export async function toModelEntries(forceRefresh = false): Promise<ModelEntry[]> {
  const locals = await discoverLocalModels(forceRefresh);
  return locals.map(({ id, name, provider, icon, is_free }) => ({ id, name, provider, icon, is_free }));
}
