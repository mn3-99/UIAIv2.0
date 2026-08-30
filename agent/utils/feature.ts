// agent/utils/feature.ts
// Feature flags (doc 01 §1, doc 02 etape 4). Doc 14 : config complete.
// Cache local "stale-acceptable" si la source distante est indisponible.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, ensureConfigDir } from '../setup';

export type FeatureFlag =
  | 'PROACTIVE'
  | 'KAIROS'
  | 'KAIROS_BRIEF'
  | 'BRIDGE_MODE'
  | 'DAEMON'
  | 'VOICE_MODE'
  | 'WORKFLOW_SCRIPTS'
  | 'COORDINATOR_MODE'
  | 'TRANSCRIPT_CLASSIFIER'
  | 'BUDDY'
  | 'NATIVE_CLIENT_ATTESTATION'
  | 'HISTORY_SNIP'
  | 'EXPERIMENTAL_SKILL_SEARCH'
  | 'DUMP_SYSTEM_PROMPT'
  | 'CHICAGO_MCP'
  | 'REACTIVE_COMPACT'
  | 'CONTEXT_COLLAPSE'
  | 'BRIDGE'
  | 'COORDINATOR';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  PROACTIVE: false,
  KAIROS: false,
  KAIROS_BRIEF: false,
  BRIDGE_MODE: false,
  DAEMON: false,
  VOICE_MODE: false,
  WORKFLOW_SCRIPTS: false,
  COORDINATOR_MODE: true,
  TRANSCRIPT_CLASSIFIER: false,
  BUDDY: false,
  NATIVE_CLIENT_ATTESTATION: false,
  HISTORY_SNIP: false,
  EXPERIMENTAL_SKILL_SEARCH: false,
  DUMP_SYSTEM_PROMPT: true,
  CHICAGO_MCP: false,
  REACTIVE_COMPACT: false,
  CONTEXT_COLLAPSE: false,
  BRIDGE: true,
  COORDINATOR: true,
};

let flags: Record<FeatureFlag, boolean> = { ...DEFAULTS };

function cachePath(): string {
  return join(configDir(), 'feature-flags.json');
}

/** Charge les flags : override env > cache local > defauts. */
export async function loadFeatureFlags(): Promise<void> {
  ensureConfigDir();
  const path = cachePath();
  if (existsSync(path)) {
    try {
      const cached = JSON.parse(readFileSync(path, 'utf8')) as Partial<Record<FeatureFlag, boolean>>;
      flags = { ...DEFAULTS, ...cached };
    } catch {
      flags = { ...DEFAULTS }; // cache corrompu -> defauts (degradation gracieuse)
    }
  } else {
    writeFileSync(path, JSON.stringify(DEFAULTS, null, 2));
  }
  for (const name of Object.keys(DEFAULTS) as FeatureFlag[]) {
    const envVal = process.env[`UIAI_FEATURE_${name}`];
    if (envVal !== undefined) flags[name] = envVal === '1' || envVal === 'true';
  }
}

/** Equivalent du `feature('KAIROS')` compile-time de Bun, en runtime. */
export function feature(name: FeatureFlag): boolean {
  return flags[name] ?? false;
}

export function setFeature(name: FeatureFlag, value: boolean): void {
  flags[name] = value;
  writeFileSync(cachePath(), JSON.stringify(flags, null, 2));
}
