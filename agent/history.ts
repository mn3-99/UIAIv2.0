// agent/history.ts
// Historique des sessions (doc 01 structure ; doc 02 resume/continue).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { configDir, ensureConfigDir } from './setup';
import type { ChatMessage } from './services/api';

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  messages: ChatMessage[];
}

function sessionsDir(): string {
  const dir = join(configDir(), 'sessions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionPath(id: string): string {
  return join(sessionsDir(), `${id}.json`);
}

export function createSession(): Session {
  const now = new Date().toISOString();
  const session: Session = { id: randomUUID(), createdAt: now, updatedAt: now, cwd: process.cwd(), messages: [] };
  saveSession(session);
  return session;
}

export function saveSession(session: Session): void {
  ensureConfigDir();
  session.updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

/** Charge une session par id (doc 02 : --resume <id>). */
export function loadSession(id: string): Session | null {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Session;
  } catch {
    return null; // session corrompue -> nouvelle session (degradation gracieuse)
  }
}

/** Derniere session modifiee (doc 02 : --continue). */
export function getLastSession(): Session | null {
  const dir = sessionsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return null;
  let best: Session | null = null;
  for (const f of files) {
    const s = loadSession(f.replace(/\.json$/, ''));
    if (s && (!best || s.updatedAt > best.updatedAt)) best = s;
  }
  return best;
}
