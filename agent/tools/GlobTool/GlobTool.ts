// agent/tools/GlobTool/GlobTool.ts
// Recherche de fichiers par pattern glob (doc 04). Implementation pure Node :
// convertit le pattern en regex et parcourt le dossier (ignore node_modules/.git).

import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { Tool, ToolResult } from '../../Tool';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'venv', '__pycache__', '.next']);
const MAX_RESULTS = 200;
const MAX_DEPTH = 8;

/** Convertit un pattern glob simple en RegExp. */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '')   // ** -> marqueur
    .replace(/\*/g, '[^/]*')
    .replace(//g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

async function walk(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_RESULTS) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_RESULTS) return;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name)) await walk(full, depth + 1, out);
    } else {
      out.push(full);
    }
  }
}

export const GlobTool: Tool = {
  name: 'Glob',
  description: 'Find files matching a glob pattern (e.g. "**/*.ts").',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '');
    const base = resolve(process.cwd(), String(input.path ?? '.'));
    const regex = globToRegex(pattern);
    const files: string[] = [];
    await walk(base, 0, files);
    const matched = files.filter((f) => regex.test(relative(base, f)) || regex.test(f));
    return { content: matched.length > 0 ? matched.join('\n') : '(aucun fichier trouve)' };
  },
};
