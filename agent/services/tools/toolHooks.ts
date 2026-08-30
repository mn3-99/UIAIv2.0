// agent/services/tools/toolHooks.ts
// Hooks d'execution (doc 04) : pre-validation, journalisation, post-filtrage,
// metriques de performance.

import type { Tool } from '../../Tool';
import { runSettingsHooks } from '../../hooks/execHooks';
import { securityValidate } from '../../utils/security';

export interface HookMetrics {
  tool: string;
  durationMs: number;
  isError: boolean;
}

const metricsLog: HookMetrics[] = [];

export function getHookMetrics(): HookMetrics[] {
  return [...metricsLog];
}

/** Pre-execution : validation basique des inputs requis (doc 04 + doc 13). */
export async function preExecute(tool: Tool, input: Record<string, unknown>, sessionId?: string): Promise<string | null> {
  for (const key of tool.inputSchema.required ?? []) {
    if (input[key] === undefined || input[key] === null) {
      return `Error: missing required input '${key}' for tool ${tool.name}`;
    }
  }
  if (process.env.UIAI_AGENT_DEBUG) {
    process.stderr.write(`[hook:pre] ${tool.name} ${JSON.stringify(input).slice(0, 200)}\n`);
  }
  // Doc 15 : validation centralisee des inputs (traversal, commandes dangereuses, secrets)
  const secErr = securityValidate(tool.name, input);
  if (secErr) return secErr;
  // Doc 13 : hooks shell pre-tool-use configures dans settings.json
  const res = await runSettingsHooks('pre-tool-use', { toolName: tool.name, input, sessionId });
  if (res.blocked) return `Blocked by pre-tool-use hook: ${res.message}`;
  return null;
}

/** Post-execution : filtrage de la sortie + metriques (doc 04 + doc 13). */
export function postExecute(tool: Tool, result: string, isError: boolean, durationMs: number, sessionId?: string): string {
  metricsLog.push({ tool: tool.name, durationMs, isError });
  if (metricsLog.length > 500) metricsLog.shift();
  // Filtrage : coupe les sorties gigantesques avant renvoi a l'API
  const MAX_RESULT = 60_000;
  const filtered = result.length > MAX_RESULT
    ? `${result.slice(0, MAX_RESULT)}\n[...sortie tronquee: ${result.length} caracteres...]`
    : result;
  if (process.env.UIAI_AGENT_DEBUG) {
    process.stderr.write(`[hook:post] ${tool.name} ${durationMs}ms error=${isError}\n`);
  }
  // Doc 13 : hooks shell post-tool-use (fire-and-forget, non bloquant ici)
  void runSettingsHooks('post-tool-use', { toolName: tool.name, output: filtered, sessionId });
  return filtered;
}
