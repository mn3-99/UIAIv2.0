// agent/tools/FileEditTool/FileEditTool.ts
// Edition par remplacement exact avec rollback possible (doc 04).

import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Tool, ToolResult } from '../../Tool';

/** Sauvegardes en memoire pour rollback (chemin -> contenu precedent). */
const backups = new Map<string, string>();

export function rollbackLastEdit(filePath: string): boolean {
  const prev = backups.get(filePath);
  if (prev === undefined) return false;
  void writeFile(filePath, prev, 'utf-8');
  backups.delete(filePath);
  return true;
}

export const FileEditTool: Tool = {
  name: 'Edit',
  description: 'Edit a file by replacing an exact string with a new string (diff-based).',
  risk: 'MEDIUM',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path of the file to edit' },
      old_string: { type: 'string', description: 'Exact string to replace' },
      new_string: { type: 'string', description: 'Replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(input.file_path ?? '');
    const oldString = String(input.old_string ?? '');
    const newString = String(input.new_string ?? '');
    const replaceAll = Boolean(input.replace_all);
    const resolved = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

    try {
      const content = await readFile(resolved, 'utf-8');
      if (!content.includes(oldString)) {
        return { content: 'Error: old_string not found in file', isError: true };
      }
      if (!replaceAll && content.split(oldString).length - 1 > 1) {
        return { content: 'Error: old_string found multiple times; provide more context or replace_all=true', isError: true };
      }
      backups.set(resolved, content); // snapshot pour rollback
      const updated = replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString);
      await writeFile(resolved, updated, 'utf-8');
      return { content: `Edited ${resolved} (${replaceAll ? 'all occurrences' : '1 occurrence'})` };
    } catch (error) {
      return { content: `Error editing file: ${error instanceof Error ? error.message : error}`, isError: true };
    }
  },
};
