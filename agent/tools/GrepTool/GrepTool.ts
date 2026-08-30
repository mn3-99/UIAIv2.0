// agent/tools/GrepTool/GrepTool.ts
// Recherche regex dans les fichiers (doc 04). Utilise `rg` si disponible,
// sinon parcours Node pur (ignore node_modules/.git).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Tool, ToolResult } from '../../Tool';

const execFileAsync = promisify(execFile);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'venv', '__pycache__']);
const MAX_RESULTS = 100;
const MAX_FILE_BYTES = 512 * 1024;

async function rgAvailable(): Promise<boolean> {
  try {
    await execFileAsync('rg', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function nodeGrep(regex: RegExp, dir: string, out: string[]): Promise<void> {
  if (out.length >= MAX_RESULTS) return;
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
      if (!IGNORED_DIRS.has(e.name)) await nodeGrep(regex, full, out);
    } else {
      try {
        const content = await readFile(full, 'utf-8');
        if (Buffer.byteLength(content) > MAX_FILE_BYTES) continue;
        content.split('\n').forEach((line, i) => {
          if (out.length < MAX_RESULTS && regex.test(line)) {
            out.push(`${full}:${i + 1}: ${line.slice(0, 300)}`);
          }
        });
      } catch {
        continue;
      }
    }
  }
}

export const GrepTool: Tool = {
  name: 'Grep',
  description: 'Search for a regex pattern in files.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
      include: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
    },
    required: ['pattern'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '');
    const base = resolve(process.cwd(), String(input.path ?? '.'));
    const include = input.include ? String(input.include) : null;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return { content: `Error: invalid regex '${pattern}'`, isError: true };
    }

    if (await rgAvailable()) {
      try {
        const args = ['--no-heading', '--line-number', '--max-count', String(MAX_RESULTS)];
        if (include) args.push('--glob', include);
        args.push('-e', pattern, base);
        const { stdout } = await execFileAsync('rg', args, { maxBuffer: 4 * 1024 * 1024 });
        return { content: stdout.trim() || '(aucune correspondance)' };
      } catch (err) {
        // rg retourne exit=1 sans correspondance
        if ((err as { code?: number }).code === 1) return { content: '(aucune correspondance)' };
      }
    }

    const out: string[] = [];
    await nodeGrep(regex, base, out);
    const filtered = include
      ? out.filter((l) => l.split(':')[0].endsWith(include.replace(/^\*\./, '.')))
      : out;
    return { content: filtered.length > 0 ? filtered.join('\n') : '(aucune correspondance)' };
  },
};
