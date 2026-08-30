// agent/context.ts
// Contexte partage passe aux commandes (doc 05 : CommandContext).

import type { AgentContext } from './main';
import type { Session } from './history';

export interface CommandContext {
  agent: AgentContext;
  session: Session;
  /** Interroge le modele (utilise par /commit, /review, /compact...). */
  query: (prompt: string) => Promise<string>;
  log: (msg: string) => void;
  clearHistory: () => void;
  /** Bascule le mode vim (doc 13). */
  setVimMode: (enabled: boolean) => void;
}
