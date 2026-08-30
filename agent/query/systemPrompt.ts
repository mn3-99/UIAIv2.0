// agent/query/systemPrompt.ts
// Prompts systeme modulaires (doc 01 §3, doc 03 : sections stables + volatiles,
// separateur de cache explicite entre les deux pour maximiser le cache hit).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadMemoryContext } from '../memdir/memdir';
import { loadMijlAIMd } from '../setup';
import { CYBER_RISK_INSTRUCTION } from '../constants/cyberRiskInstruction';

// ── Sections stables (cachables) ─────────────────────────────────────────────

const ROLE_INSTRUCTIONS = [
  'Tu es UIAI-Agent, un agent en ligne de commande integre au projet UIAIv2.0.',
  'Tu aides l\'utilisateur a developper, deboguer et operer son projet.',
].join('\n');

const SECURITY_INSTRUCTIONS = [
  'Ne revele jamais de secrets, cles API ou contenus de fichiers sensibles.',
  'Demande confirmation avant toute action destructive.',
  CYBER_RISK_INSTRUCTION,
].join('\n');

const TOOL_USAGE_RULES = [
  'Utilise les outils fournis quand c\'est pertinent; explique brievement pourquoi.',
  'Ne fabrique jamais de resultat d\'outil: attends le resultat reel.',
].join('\n');

const STYLE_AND_TONE = [
  'Reponds de facon concise et precise, dans la langue de l\'utilisateur.',
].join('\n');

/** Point de rupture du cache (doc 03 : cache-break signal). */
export const CACHE_BREAK = '--- volatile ---';

// ── Sections volatiles (dynamiques) ──────────────────────────────────────────

function gitStatus(cwd: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `Branche git: ${branch}${dirty ? `, ${dirty.split('\n').length} fichier(s) modifie(s)` : ', propre'}`;
  } catch {
    return 'Pas de depot git ici.';
  }
}

function readProjectNotes(cwd: string): string {
  // Equivalent MijlAI.md : le projet UIAI utilise AGENTS.md
  const parts: string[] = [];
  for (const name of ['AGENTS.md', 'MEMORY.md']) {
    const p = join(cwd, name);
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      parts.push(`## ${name}\n${content.slice(0, 4000)}`);
    }
  }
  return parts.join('\n\n');
}

export interface SystemPromptParts {
  stable: string[];
  volatile: string[];
}

/** fetchSystemPromptParts (doc 03) : separe stable / volatile. */
export function fetchSystemPromptParts(cwd: string = process.cwd()): SystemPromptParts {
  let memoryCtx = '';
  try {
    memoryCtx = loadMemoryContext();
  } catch {
    memoryCtx = '';
  }
  return {
    stable: [ROLE_INSTRUCTIONS, SECURITY_INSTRUCTIONS, TOOL_USAGE_RULES, STYLE_AND_TONE],
    volatile: [
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      `Repertoire courant: ${cwd}`,
      gitStatus(cwd),
      readProjectNotes(cwd),
      (() => {
        const md = loadMijlAIMd(cwd);
        return md ? `## MijlAI.md (instructions projet)\n${md}` : '';
      })(),
      memoryCtx,
    ].filter((s) => s.length > 0),
  };
}

/** Prompt systeme complet : stables d'abord, rupture de cache, volatiles. */
export function getSystemPrompt(cwd: string = process.cwd()): string {
  const parts = fetchSystemPromptParts(cwd);
  return [...parts.stable, CACHE_BREAK, ...parts.volatile].join('\n\n');
}
