// agent/QueryEngine.ts
// Moteur d'execution (doc 03) : cycle de vie d'une requete, boucle tool-use,
// verification des permissions, retry (via ApiClient), suivi d'usage.

import { ApiClient, type ChatMessage, type ToolCall, type ToolSpec } from './services/api';
import { prepareQuery, DEFAULT_TOKEN_BUDGET } from './query';
import { trackUsage } from './cost-tracker';

// ── Contrats de la boucle tool-use (doc 03) ─────────────────────────────────

export type PermissionDecision = 'approved' | 'denied' | 'ask_user';

/** Branche du systeme de permissions (doc 08 fournira l'implementation). */
export type PermissionChecker = (call: ToolCall) => Promise<PermissionDecision>;

/** Executant d'outil (doc 04 fournira le registre complet). */
export type ToolExecutor = (name: string, argsJson: string) => Promise<string>;

export interface QueryEngineOptions {
  api: ApiClient;
  tools?: ToolSpec[];
  executeTool?: ToolExecutor;
  checkPermission?: PermissionChecker;
  /** Appele avec chaque delta de texte en streaming. */
  onDelta?: (text: string) => void;
  /** Appele a chaque execution d'outil (pour l'UI). */
  onToolEvent?: (event: { name: string; status: 'start' | 'done' | 'denied' | 'error'; detail?: string }) => void;
  tokenBudget?: number;
  maxTurns?: number;
  signal?: AbortSignal;
  /** Prompt systeme personnalise (doc 11 : sous-agents). */
  systemPrompt?: string;
}

export interface QueryResult {
  text: string;
  messages: ChatMessage[];
  turns: number;
}

const DEFAULT_MAX_TURNS = 16;

/** Permission par defaut : tout approuver (doc 08 remplacera par le vrai systeme). */
const defaultPermission: PermissionChecker = async () => 'approved';

export class QueryEngine {
  constructor(private opts: QueryEngineOptions) {}

  /**
   * Boucle de requete complete (doc 03) :
   * appel API -> tool_use? -> permissions -> execution -> resultats -> rappel.
   */
  async query(rawInput: string, history: ChatMessage[], cwd?: string): Promise<QueryResult> {
    const budget = this.opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const maxTurns = this.opts.maxTurns ?? DEFAULT_MAX_TURNS;
    const checkPermission = this.opts.checkPermission ?? defaultPermission;

    const prepared = prepareQuery(rawInput, history, cwd, budget);
    const messages: ChatMessage[] = [...prepared.messages];
    // Doc 11 : remplacement du prompt systeme pour les sous-agents
    if (this.opts.systemPrompt) {
      const si = messages.findIndex((m) => m.role === 'system');
      if (si >= 0) messages[si] = { role: 'system', content: this.opts.systemPrompt };
    }

    let turns = 0;
    for (;;) {
      if (turns >= maxTurns) {
        return { text: '[stop] nombre maximal de tours atteint', messages, turns };
      }
      turns += 1;

      // Appel API (streaming si onDelta fourni) — retry gere par ApiClient
      const result = this.opts.onDelta
        ? await this.opts.api.chatStream(messages, this.opts.tools, this.opts.onDelta, this.opts.signal)
        : await this.opts.api.chat(messages, this.opts.tools);
      trackUsage(result.usage);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.text || null,
        ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
      };
      messages.push(assistantMsg);

      // Pas de tool_use -> fin de la boucle (doc 03)
      if (result.toolCalls.length === 0 || !this.opts.executeTool) {
        return { text: result.text, messages, turns };
      }

      // Boucle tool-use : permissions puis execution (doc 03)
      for (const call of result.toolCalls) {
        const permission = await checkPermission(call);
        let toolContent: string;

        switch (permission) {
          case 'approved': {
            this.opts.onToolEvent?.({ name: call.function.name, status: 'start' });
            try {
              toolContent = await this.opts.executeTool(call.function.name, call.function.arguments);
              this.opts.onToolEvent?.({ name: call.function.name, status: 'done' });
            } catch (err) {
              toolContent = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              this.opts.onToolEvent?.({ name: call.function.name, status: 'error', detail: toolContent });
            }
            break;
          }
          case 'denied':
            toolContent = 'Permission denied by user';
            this.opts.onToolEvent?.({ name: call.function.name, status: 'denied' });
            break;
          case 'ask_user':
            // Doc 08 branchera le prompt interactif ; par defaut on refuse.
            toolContent = 'Permission requires user approval (non disponible ici) — refuse.';
            this.opts.onToolEvent?.({ name: call.function.name, status: 'denied', detail: 'ask_user non interactif' });
            break;
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: toolContent,
        });
      }
      // Les resultats sont ajoutes -> nouvel appel API (continuation automatique)
    }
  }
}
