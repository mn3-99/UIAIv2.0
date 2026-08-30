// agent/tools/FileReadTool/FileReadTool.ts
// Lecture de fichier avec plages de lignes, format cat -n (doc 04).

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Tool, ToolResult } from '../../Tool';

export const FileReadTool: Tool = {
  name: 'Read',
  description: 'Read a file from the local filesystem, with optional line ranges.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file to read' },
      offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
      limit: { type: 'number', description: 'Number of lines to read (default 2000)' },
    },
    required: ['file_path'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(input.file_path ?? '');
    const offset = Math.max(0, Number(input.offset ?? 1) - 1);
    const limit = Number(input.limit ?? 2000);

    if (!isAbsolute(filePath) && !filePath.startsWith('.')) {
      // chemins relatifs resolus depuis le cwd du process
    }
    const resolved = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    if (resolved.includes('..\\') || resolved.split('/').includes('..')) {
      return { content: 'Error: path traversal detected', isError: true };
    }

    try {
      const content = await readFile(resolved, 'utf-8');
      const lines = content.split('\n');
      const slice = lines.slice(offset, offset + limit);
      const numbered = slice.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');
      return { content: numbered || '(fichier vide)' };
    } catch (error) {
      return { content: `Error reading file: ${error instanceof Error ? error.message : error}`, isError: true };
    }
  },
};
