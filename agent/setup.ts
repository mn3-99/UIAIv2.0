// agent/setup.ts
// Configuration initiale (doc 02) : dossier ~/.uiai-agent/, migration,
// validation de la cle API, initialisation de la memoire.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from './constants/index.js';

export interface AgentConfig {
  version: number;
  baseUrl?: string;
  model?: string;
  theme?: 'dark' | 'light';
  permissions?: Record<string, unknown>;
  [key: string]: unknown;
}

export const CONFIG_VERSION = 1;

export function configDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

/** Cree le dossier de configuration si absent (doc 02 : setup.ts). */
export function ensureConfigDir(): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/** Charge la configuration, avec migration des anciens formats. */
export function loadConfig(): AgentConfig {
  ensureConfigDir();
  const path = configPath();
  if (!existsSync(path)) {
    const fresh: AgentConfig = { version: CONFIG_VERSION };
    writeFileSync(path, JSON.stringify(fresh, null, 2), { mode: 0o600 });
    return fresh;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as AgentConfig;
    return migrateConfig(raw, path);
  } catch {
    // Config corrompue -> reset avec sauvegarde (degradation gracieuse, doc 02).
    const backup = `${path}.broken-${Date.now()}`;
    renameSync(path, backup);
    const fresh: AgentConfig = { version: CONFIG_VERSION };
    writeFileSync(path, JSON.stringify(fresh, null, 2), { mode: 0o600 });
    return fresh;
  }
}

/** Migration des anciens formats de configuration (doc 02). */
function migrateConfig(cfg: AgentConfig, path: string): AgentConfig {
  if (typeof cfg.version !== 'number' || cfg.version < CONFIG_VERSION) {
    const migrated: AgentConfig = { ...cfg, version: CONFIG_VERSION };
    writeFileSync(path, JSON.stringify(migrated, null, 2), { mode: 0o600 });
    return migrated;
  }
  return cfg;
}

export function saveConfig(cfg: AgentConfig): void {
  ensureConfigDir();
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/**
 * Validation de la cle API (doc 02).
 * L'agent s'appuie sur les endpoints du projet UIAI : une cle locale
 * (UIAI_API_KEY) peut etre exigee par le serveur selon sa configuration.
 * Retourne la cle ou null si non requise/absente.
 */
/**
 * Charge le fichier MijlAI.md du projet (doc 14) : instructions en langage
 * naturel injectees dans le prompt systeme. Cherche a la racine et dans .MijlAI/.
 */
export function loadMijlAIMd(projectDir: string = process.cwd()): string | null {
  const candidates = [join(projectDir, 'MijlAI.md'), join(projectDir, '.MijlAI', 'MijlAI.md')];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return readFileSync(c, 'utf-8');
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Charge la configuration projet (.MijlAI.json) si presente (doc 14). */
export function loadProjectConfig(projectDir: string = process.cwd()): Partial<AgentConfig> {
  const p = join(projectDir, '.MijlAI.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Partial<AgentConfig>;
  } catch {
    return {};
  }
}

/**
 * Configuration multi-niveaux (doc 14) : fusionne defaults < user < project < env.
 * Priorite (haute -> basse) : CLI/args > env > projet (.MijlAI.json) > user (~/.uiai-agent/config.json) > defaults.
 */
export function getEffectiveConfig(extra: Record<string, unknown> = {}): AgentConfig {
  const user = loadConfig();
  const project = loadProjectConfig();
  const merged: AgentConfig = { ...user, ...project, ...extra } as AgentConfig;
  return merged;
}

export function resolveApiKey(): string | null {
  return process.env.UIAI_API_KEY ?? null;
}
