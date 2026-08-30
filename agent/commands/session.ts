// agent/commands/session.ts
// Commandes de session : /compact, /cost, /context, /tasks, /resume (doc 05).

import type { Command } from '../commands';
import { estimateMessagesTokens } from '../query';
import { formatUsage, getSessionUsage } from '../cost-tracker';
import { listTasks } from '../tasks/index';
import { saveSession } from '../history';

export const compactCommand: Command = {
  name: 'compact',
  description: 'Compacte l\'historique des messages (resume les anciens)',
  async run(_args, ctx) {
    const before = estimateMessagesTokens(ctx.session.messages);
    const summary = await ctx.query(
      'Resume cette conversation en 5 puces maximum pour conserver le contexte essentiel.',
    );
    ctx.session.messages = [
      { role: 'user', content: '[Historique compacte]' },
      { role: 'assistant', content: summary },
    ];
    saveSession(ctx.session);
    const after = estimateMessagesTokens(ctx.session.messages);
    return `Compaction: ~${before} -> ~${after} tokens estimes.`;
  },
};

export const costCommand: Command = {
  name: 'cost',
  description: 'Rapport d\'utilisation (tokens, requetes)',
  run: () => {
    const u = getSessionUsage();
    return `Session: ${formatUsage()}\nTotal estime: ~${u.inputTokens + u.outputTokens} tokens`;
  },
};

export const contextCommand: Command = {
  name: 'context',
  description: 'Gere les fichiers de contexte (/context add @fichier | /context list)',
  run: (args, ctx) => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    if (sub === 'list' || !sub) {
      const attached = ctx.session.messages.filter((m) => m.role === 'user' && m.content?.includes('--- '));
      return attached.length > 0 ? `${attached.length} message(s) avec pieces jointes.` : 'Aucun contexte attache.';
    }
    if (sub === 'add') {
      const target = rest.join(' ');
      return `Pour attacher un fichier, mentionnez-le dans votre message: @${target}`;
    }
    return 'Usage: /context [list|add <fichier>]';
  },
};

export const tasksCommand: Command = {
  name: 'tasks',
  description: 'Liste les taches en arriere-plan',
  run: () => {
    const tasks = listTasks();
    return tasks.length > 0
      ? tasks.map((t) => `${t.id} [${t.status}] ${t.description}`).join('\n')
      : '(aucune tache)';
  },
};

export const resumeCommand: Command = {
  name: 'resume',
  description: 'Reprendre une session: /resume <id>',
  run: (args) => `Pour reprendre une session, relancez: npm run agent -- --resume ${args.trim() || '<id>'}`,
};
