// agent/multiagent/subagent.ts
// Execution de sous-agents (doc 11 : AgentTool + spawnSubagent).

import { ApiClient } from '../services/api';
import { getToolRegistry, type ToolRegistry } from '../tools';
import { QueryEngine } from '../QueryEngine';
import { PermissionSystem, type PermissionMode } from '../permissions/PermissionSystem';
import { resolveApiKey } from '../setup';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, ENV } from '../constants/index';
import { assignColor, type AgentColor } from './colors';
import { recordDailyLog } from '../memdir/memdir';

export type SubagentType = 'general-purpose' | 'Explore' | 'Plan' | 'MijlAI-code-guide';

const SUBAGENT_PROMPTS: Record<SubagentType, string> = {
  'general-purpose':
    'Tu es un agent autonome polyvalent. Execute la tache demandee de facon concise et renvoie un resultat final clair.',
  Explore:
    'Tu es un agent d\'exploration de codebase. Recherche, lis et resume tres vite. Sois factuel et cite les chemins de fichiers.',
  Plan:
    'Tu es un agent de planification. Analyse la demande et produis un plan d\'implementation detaille et atomique, sans coder.',
  'MijlAI-code-guide':
    'Tu es un guide d\'utilisation de l\'agent en ligne de commande. Reonds de facon precise sur les commandes et le fonctionnement.',
};

export interface SpawnOptions {
  prompt: string;
  type?: SubagentType;
  workingDirectory?: string;
  allowedTools?: string[];
  colorIndex?: number;
  onLog?: (msg: string) => void;
}

/**
 * Cree un sous-agent qui opere dans son propre contexte (doc 11).
 * Chaque sous-agent a sa propre conversation API, un sous-ensemble d'outils,
 * et renvoie son resultat final a l'agent parent.
 */
export async function spawnSubagent(opts: SpawnOptions): Promise<string> {
  const type = opts.type ?? 'general-purpose';
  const color: AgentColor = assignColor(opts.colorIndex ?? 0);
  const onLog = opts.onLog ?? (() => {});
  onLog(`[subagent:${type}] demarre (couleur ${color})`);

  const baseUrl = process.env[ENV.BASE_URL] ?? DEFAULT_BASE_URL;
  const model = process.env[ENV.MODEL] ?? DEFAULT_MODEL;
  const api = new ApiClient({ baseUrl, apiKey: resolveApiKey(), model });

  // Sous-ensemble d'outils (on exclut AgentTool pour eviter la recursion)
  const registry: ToolRegistry = await getToolRegistry();
  const specs = (opts.allowedTools ?? registry.getAll().map((t) => t.name).filter((n) => n !== 'Agent'))
    .map((n) => registry.get(n))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((t) => registry.getSpec(t));

  // Les sous-agents tournent en mode bypass (pas d'utilisateur interactif)
  const perms = new PermissionSystem({ mode: 'bypass' as PermissionMode, registry });

  // Boucle de requete independante (doc 11 : spawnSubagent)
  const { executeWithPermission } = await import('../services/tools/StreamingToolExecutor');

  const runEngine = new QueryEngine({
    api,
    tools: specs,
    executeTool: async (name, argsJson) => {
      const executed = await executeWithPermission(
        registry,
        { id: `sub-${Date.now()}`, type: 'function', function: { name, arguments: argsJson } },
        { workingDirectory: opts.workingDirectory ?? process.cwd(), sessionId: 'subagent' },
        async (call) => perms.decide(call),
      );
      return executed.result.content;
    },
    onDelta: (t) => onLog(t),
    onToolEvent: () => {},
    systemPrompt: SUBAGENT_PROMPTS[type],
  });

  const result = await runEngine.query(opts.prompt, []);
  recordDailyLog(`Sub-agent ${type} termine`);
  return result.text || '';
}
