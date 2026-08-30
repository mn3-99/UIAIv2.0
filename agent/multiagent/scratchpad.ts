// agent/multiagent/scratchpad.ts
// Scratchpad partage entre agents (doc 11 : espace de notes durables).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '../setup';

interface ScratchNote {
  findings: string;
  risks?: string[];
  files?: string[];
  updatedAt: number;
}

const DIR = join(configDir(), 'scratchpad');

function ensure(): void {
  mkdirSync(DIR, { recursive: true });
}

/** Ecrit une note dans le scratchpad partage. */
export async function writeScratch(key: string, note: Omit<ScratchNote, 'updatedAt'>): Promise<void> {
  ensure();
  writeFileSync(join(DIR, `${key}.json`), JSON.stringify({ ...note, updatedAt: Date.now() }, null, 2));
}

/** Lit une note du scratchpad. */
export async function readScratch(key: string): Promise<ScratchNote | null> {
  const p = join(DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as ScratchNote;
  } catch {
    return null;
  }
}

/** Liste les cles disponibles. */
export async function listScratch(): Promise<string[]> {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => f.replace(/\.json$/, ''));
}
