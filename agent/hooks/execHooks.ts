// agent/hooks/execHooks.ts
// Hooks d'execution (doc 13) : lifecycle callbacks (pre/post sampling) + hooks
// shell configures dans settings.json (pre-tool-use / post-tool-use).

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '../setup';

export type HookPhase = 'pre-tool' | 'post-tool' | 'pre-query' | 'post-query';

export interface HookContext {
  toolName?: string;
  input?: unknown;
  sessionId?: string;
  output?: string;
}

export type HookHandler = (ctx: HookContext) => Promise<void> | void;

export interface HookResult {
  blocked: boolean;
  message?: string;
}

/** Systeme de hooks en code (doc 13 : HookSystem). */
export class HookSystem {
  private hooks = new Map<HookPhase, HookHandler[]>();

  register(phase: HookPhase, handler: HookHandler): void {
    const existing = this.hooks.get(phase) ?? [];
    this.hooks.set(phase, [...existing, handler]);
  }

  async run(phase: HookPhase, ctx: HookContext): Promise<void> {
    for (const handler of this.hooks.get(phase) ?? []) {
      await handler(ctx);
    }
  }
}

// Hooks shell configures dans settings.json
interface SettingsHook {
  matcher: string;
  command: string;
}
interface SettingsHooks {
  'pre-tool-use'?: SettingsHook[];
  'post-tool-use'?: SettingsHook[];
}

function loadSettingsHooks(): SettingsHooks {
  const p = join(configDir(), 'settings.json');
  if (!existsSync(p)) return {};
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf-8')) as { hooks?: SettingsHooks };
    return cfg.hooks ?? {};
  } catch {
    return {};
  }
}

function matchesPattern(matcher: string, name: string | undefined): boolean {
  if (!name) return false;
  if (matcher === '*') return true;
  return matcher === name;
}

/** Execute les hooks shell d'une phase (doc 13 : runHooks). */
export async function runSettingsHooks(
  phase: 'pre-tool-use' | 'post-tool-use',
  ctx: HookContext,
): Promise<HookResult> {
  const hooks = loadSettingsHooks()[phase] ?? [];
  for (const hook of hooks) {
    if (!matchesPattern(hook.matcher, ctx.toolName)) continue;
    const result = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
      execFile('bash', ['-c', hook.command], {
        env: {
          ...process.env,
          TOOL_NAME: ctx.toolName ?? '',
          TOOL_INPUT: JSON.stringify(ctx.input ?? {}),
          SESSION_ID: ctx.sessionId ?? '',
          TOOL_OUTPUT: ctx.output ?? '',
        },
        maxBuffer: 1024 * 1024,
      }, (err, _stdout, stderr) => {
        resolve({ exitCode: err ? 1 : 0, stderr: stderr.toString() });
      });
    });
    if (result.exitCode !== 0) {
      return { blocked: true, message: result.stderr };
    }
  }
  return { blocked: false };
}

export const hookSystem = new HookSystem();
