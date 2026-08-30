// agent/tools/FileWriteTool/FileWriteTool.ts
// Creation/ecrasement de fichier avec limite de taille (doc 04).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Tool, ToolResult } from '../../Tool';

const MAX_WRITE_BYTES = 2 * 1024 * 1024; // 2 Mo

export const FileWriteTool: Tool = {
  name: 'Write',
  description: 'Create or overwrite a file on the local filesystem.',
  risk: 'MEDIUM',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path of the file to write' },
      content: { type: 'string', description: 'Full content to write' },
    },
    required: ['file_path', 'content'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = String(input.file_path ?? '');
    const content = String(input.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) {
      return { content: 'Error: content exceeds 2MB limit', isError: true };
    }
    const resolved = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    try {
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, 'utf-8');
      return { content: `Wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${resolved}` };
    } catch (error) {
      return { content: `Error writing file: ${error instanceof Error ? error.message : error}`, isError: true };
    }
  },
};
