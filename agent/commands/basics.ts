// agent/commands/basics.ts
// Commandes fondamentales simples : version, status, exit, clear (doc 05).

import type { Command } from '../commands';
import { AGENT_VERSION } from '../constants/index';

export const versionCommand: Command = {
  name: 'version',
  description: 'Affiche la version de l\'agent',
  run: () => `uiai-agent v${AGENT_VERSION}`,
};

export const statusCommand: Command = {
  name: 'status',
  description: 'Informations de session et d\'environnement',
  run: (_args, ctx) =>
    [
      `session   = ${ctx.session.id}`,
      `messages  = ${ctx.session.messages.length}`,
      `mode      = ${ctx.agent.offline ? 'offline' : 'en ligne'}`,
      `modele    = ${ctx.agent.model}`,
      `baseUrl   = ${ctx.agent.baseUrl}`,
      `cwd       = ${ctx.session.cwd}`,
    ].join('\n'),
};

export const exitCommand: Command = {
  name: 'exit',
  aliases: ['quit', 'q'],
  description: 'Quitte le REPL',
  run: () => null, // intercepte par le REPL
};

export const clearCommand: Command = {
  name: 'clear',
  description: 'Efface l\'historique de la conversation',
  run: (_args, ctx) => {
    ctx.clearHistory();
    return 'Historique efface.';
  },
};
