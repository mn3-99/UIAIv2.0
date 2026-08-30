// agent/query.ts
// Preparation des messages (doc 03) : pipeline processUserInput ->
// fetchSystemPromptParts -> normalizeMessages, avec compaction et budget tokens.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globSync } from 'node:fs';
import type { ChatMessage } from './services/api';
import { getSystemPrompt } from './query/systemPrompt';

// ── Estimation de tokens (heuristique ~4 caracteres / token) ─────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((acc, m) => acc + estimateTokens(m.content ?? '') + 4, 0);
}

/** Budget de contexte par defaut (tokens). */
export const DEFAULT_TOKEN_BUDGET = 100_000;

// ── processUserInput (doc 03) ────────────────────────────────────────────────

export interface ProcessedInput {
  /** La commande slash detectee, ex: "/help" (sans expansion de contenu). */
  slashCommand: string | null;
  /** Texte utilisateur avec pieces jointes resolues inline. */
  text: string;
  /** Fichiers mentionnes via @chemin et resolus (glob supporte). */
  attachments: Array<{ path: string; content: string }>;
}

const MAX_ATTACHMENT_BYTES = 64 * 1024;

/**
 * Parse l'input brut : commandes slash, mentions @fichier (glob), pieces jointes.
 * (doc 03 : processUserInput)
 */
export function processUserInput(raw: string, cwd: string = process.cwd()): ProcessedInput {
  const trimmed = raw.trim();
  if (trimmed.startsWith('/')) {
    return { slashCommand: trimmed.split(/\s+/)[0], text: trimmed, attachments: [] };
  }

  const attachments: ProcessedInput['attachments'] = [];
  // Expansion des patterns glob dans les mentions @fichier
  const mentionRe = /@([^\s@]+)/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(trimmed)) !== null) {
    const pattern = match[1];
    let paths: string[] = [];
    try {
      const abs = resolve(cwd, pattern);
      if (existsSync(abs)) {
        paths = [abs];
      } else if (typeof globSync === 'function') {
        paths = globSync(pattern, { cwd }).map((p) => join(cwd, p)).slice(0, 10);
      }
    } catch {
      continue; // pattern invalide -> ignore
    }
    for (const p of paths) {
      try {
        if (!statSync(p).isFile()) continue;
        if (statSync(p).size > MAX_ATTACHMENT_BYTES) continue;
        attachments.push({ path: p, content: readFileSync(p, 'utf8') });
      } catch {
        continue;
      }
    }
  }

  const text = attachments.length > 0
    ? `${trimmed}\n\n${attachments.map((a) => `--- ${a.path} ---\n${a.content}`).join('\n\n')}`
    : trimmed;
  return { slashCommand: null, text, attachments };
}

// ── normalizeMessages (doc 03) : compaction et budget ────────────────────────

const TOMBSTONE = '[message ancien supprime]';
const TOOL_SUMMARY_MAX = 200;

/** Resume un resultat d'outil volumineux en 1-2 lignes (tool summarization). */
function summarizeToolResult(content: string): string {
  if (estimateTokens(content) <= TOOL_SUMMARY_MAX) return content;
  const firstLines = content.split('\n').slice(0, 2).join('\n');
  return `${firstLines}\n[...resume: ${estimateTokens(content)} tokens compacts...]`;
}

/**
 * Compacte les messages pour respecter le budget (doc 03 : strategies) :
 * 1. tool summarization sur les vieux resultats volumineux
 * 2. tombstone sur les anciens messages
 * 3. history snip en dernier recours
 */
export function normalizeMessages(
  messages: ChatMessage[],
  budget: number = DEFAULT_TOKEN_BUDGET,
): ChatMessage[] {
  let normalized = messages.map((m) =>
    m.role === 'tool' && m.content ? { ...m, content: summarizeToolResult(m.content) } : m,
  );

  if (estimateMessagesTokens(normalized) <= budget) return normalized;

  // Tombstone des messages anciens (garde les 4 plus recents intacts)
  normalized = normalized.map((m, i) =>
    i < normalized.length - 4 && m.content && estimateTokens(m.content) > 50
      ? { ...m, content: TOMBSTONE }
      : m,
  );
  if (estimateMessagesTokens(normalized) <= budget) return normalized;

  // History snip : supprime les plus anciens (hors systeme)
  const system = normalized.filter((m) => m.role === 'system');
  const rest = normalized.filter((m) => m.role !== 'system');
  while (rest.length > 2 && estimateMessagesTokens([...system, ...rest]) > budget) {
    rest.shift();
  }
  return [...system, ...rest];
}

// ── Pipeline complet (doc 03) ────────────────────────────────────────────────

export interface PreparedQuery {
  messages: ChatMessage[];
  processed: ProcessedInput;
}

/** Construit les messages prets pour l'API a partir de l'input brut. */
export function prepareQuery(
  rawInput: string,
  history: ChatMessage[],
  cwd: string = process.cwd(),
  budget: number = DEFAULT_TOKEN_BUDGET,
): PreparedQuery {
  const processed = processUserInput(rawInput, cwd);
  const system: ChatMessage = { role: 'system', content: getSystemPrompt(cwd) };
  const all: ChatMessage[] = [system, ...history, { role: 'user', content: processed.text }];
  return { messages: normalizeMessages(all, budget), processed };
}
