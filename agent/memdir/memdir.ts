// agent/memdir/memdir.ts
// Ordonnanceur du systeme de memoire (doc 09).

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { configDir } from '../setup';
import type { MemoryFile, MemoryType } from './memoryTypes';
import { saveMemory, loadMemories, parseMemoryFile } from './memoryFile';

export const MEMORY_DIR = join(configDir(), 'memory');
export const DAILY_DIR = join(MEMORY_DIR, 'daily');

function ensure(): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  mkdirSync(DAILY_DIR, { recursive: true });
}

/** Contexte memoire injecte dans le prompt systeme (doc 09 : integration). */
export function loadMemoryContext(): string {
  const memories = loadMemories();
  if (memories.length === 0) return '';
  const index = memories
    .map((m) => `- [${m.name}](${basename(m.filePath)}) — ${m.description}`)
    .join('\n');
  const details = memories.map((m) => `## ${m.name}\n${m.content}`).join('\n\n');
  return `## Memory Index\n${index}\n\n## Memory Details\n${details}`;
}

/** Ajoute une memoire (doc 09 : ecriture). */
export function addMemory(input: {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}): MemoryFile {
  ensure();
  return saveMemory(input);
}

/** Journal quotidien append-only (doc 09 : daily logs). */
export function recordDailyLog(event: string): void {
  ensure();
  const date = new Date().toISOString().slice(0, 10);
  const path = join(DAILY_DIR, `${date}.md`);
  const stamp = new Date().toISOString();
  appendFileSync(path, `- [${stamp}] ${event}\n`);
}

/** Lit le journal quotidien le plus recent (pour consolidation). */
export function readDailyLogs(sinceDays = 3): string {
  if (!existsSync(DAILY_DIR)) return '';
  const out: string[] = [];
  for (let i = 0; i < sinceDays; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const p = join(DAILY_DIR, `${d}.md`);
    if (existsSync(p)) out.push(`# ${d}\n${readFileSync(p, 'utf-8')}`);
  }
  return out.join('\n\n');
}

// Re-export utilitaires
export { loadMemories, parseMemoryFile };
