// agent/tools/BashTool/BashTool.ts
// Execution shell avec timeout (doc 04 : HIGH risk — sandboxing gere au doc 08/15).

import { exec } from 'node:child_process';
import type { Tool, ToolResult } from '../../Tool';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 100_000;

export const BashTool: Tool = {
  name: 'Bash',
  description: 'Execute a bash command and return stdout/stderr.',
  risk: 'HIGH',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default 120000)' },
    },
    required: ['command'],
  },

  async execute(input: Record<string, unknown>, context): Promise<ToolResult> {
    const command = String(input.command ?? '');
    const timeout = Math.min(Number(input.timeout ?? DEFAULT_TIMEOUT_MS), 600_000);
    context.onProgress?.(`exec: ${command.slice(0, 120)}`);

    return new Promise<ToolResult>((resolvePromise) => {
      const child = exec(
        command,
        { cwd: process.cwd(), timeout, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          let out = '';
          if (stdout) out += stdout.slice(0, MAX_OUTPUT);
          if (stderr) out += `${out ? '\n' : ''}[stderr]\n${stderr.slice(0, MAX_OUTPUT)}`;
          if (error && !stdout && !stderr) {
            resolvePromise({ content: `Error: ${error.message}`, isError: true });
            return;
          }
          const exitInfo = error ? `\n[exit code: ${(error as { code?: number }).code ?? 'inconnu'}]` : '';
          resolvePromise({ content: (out || '(pas de sortie)') + exitInfo, isError: Boolean(error) });
        },
      );
      context.abortSignal?.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    });
  },
};
