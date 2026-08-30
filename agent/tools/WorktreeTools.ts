// agent/tools/WorktreeTools.ts
// Isolation git via worktrees (doc 11 : Enter/ExitWorktree).

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Tool, ToolResult } from '../Tool';

function gitAvailable(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const EnterWorktreeTool: Tool = {
  name: 'EnterWorktree',
  description: 'Create and enter an isolated git worktree for parallel, conflict-free changes.',
  risk: 'MEDIUM',
  inputSchema: {
    type: 'object',
    properties: {
      branch: { type: 'string', description: 'New branch name for the worktree' },
      path: { type: 'string', description: 'Optional explicit path (defaults to a temp dir)' },
    },
    required: ['branch'],
  },
  async execute(input, ctx?: { workingDirectory?: string }): Promise<ToolResult> {
    const cwd = ctx?.workingDirectory ?? process.cwd();
    if (!gitAvailable(cwd)) return { content: 'Pas un depot git — worktree ignore', isError: true };
    const wtPath = input.path ? String(input.path) : join(tmpdir(), `wt-${String(input.branch).replace(/[^\w-]/g, '_')}-${Date.now().toString(36)}`);
    try {
      execSync(`git worktree add -b ${String(input.branch)} "${wtPath}"`, { cwd, stdio: 'ignore' });
      return { content: `Worktree cree: ${wtPath} (branche ${input.branch})` };
    } catch (err) {
      return { content: `Echec worktree: ${err instanceof Error ? err.message : err}`, isError: true };
    }
  },
};

export const ExitWorktreeTool: Tool = {
  name: 'ExitWorktree',
  description: 'Remove a git worktree created earlier.',
  risk: 'MEDIUM',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Worktree path to remove' },
      force: { type: 'boolean', description: 'Force removal' },
    },
    required: ['path'],
  },
  async execute(input): Promise<ToolResult> {
    const cwd = process.cwd();
    const wtPath = String(input.path ?? '');
    if (!existsSync(wtPath)) return { content: 'Chemin introuvable', isError: true };
    try {
      execSync(`git worktree remove "${wtPath}" ${input.force ? '--force' : ''}`.trim(), { cwd, stdio: 'ignore' });
      return { content: `Worktree supprime: ${wtPath}` };
    } catch (err) {
      return { content: `Echec suppression: ${err instanceof Error ? err.message : err}`, isError: true };
    }
  },
};
