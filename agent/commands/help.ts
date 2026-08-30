// agent/commands/help.ts
import type { Command } from '../commands';

export const helpCommand: Command = {
  name: 'help',
  aliases: ['h', '?'],
  description: 'Affiche la liste des commandes disponibles',
  async run(_args, ctx) {
    const { getCommandRegistry } = await import('../commands');
    const registry = await getCommandRegistry();
    const lines = registry.getAvailable(ctx).map((c) => `  /${c.name.padEnd(14)} ${c.description}`);
    return ['Commandes disponibles:', ...lines].join('\n');
  },
};
