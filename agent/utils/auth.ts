// agent/utils/auth.ts
// Authentification (doc 12) : env var, config file, keychain (stub Linux), OAuth (stub).

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resout la cle API via les methodes documentees (doc 12).
 * Ordre : env ANTHROPIC_API_KEY / UIAI_API_KEY -> config file -> keychain (non dispo Linux) -> login.
 */
export async function resolveApiKeyRobust(): Promise<string | null> {
  const fromEnv = process.env.ANTHROPIC_API_KEY ?? process.env.UIAI_API_KEY;
  if (fromEnv) return fromEnv;

  // Fichier de configuration (~/.MijlAI/config.json ou ~/.uiai-agent/config.json)
  for (const cfgPath of [
    join(homedir(), '.uiai-agent', 'config.json'),
    join(homedir(), '.MijlAI', 'config.json'),
  ]) {
    if (existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { apiKey?: string };
        if (cfg.apiKey) return cfg.apiKey;
      } catch {
        /* ignore */
      }
    }
  }

  // Keychain natif : non disponible sous Linux (doc 12 : stub)
  // OAuth : non implemente pour les deployments locales
  return null;
}

/** Declenche une authentification interactive (doc 12 : MijlAI-code login). */
export async function login(): Promise<void> {
  throw new Error('login non supporte dans cette distribution locale (utilisez une API key)');
}
