// agent/commands/vim.ts
// /vim : active/desactive le mode vim (doc 13).

import type { Command } from '../commands';
import type { CommandContext } from '../context';

export const vimCommand: Command = {
  name: 'vim',
  description: 'Toggle vim editing mode (normal/insert/visual/command).',
  async run(_args, ctx?: CommandContext) {
    if (!ctx) return 'Contexte indisponible';
    const enabled = !ctx.agent.vimEnabled;
    ctx.agent.vimEnabled = enabled;
    ctx.setVimMode(enabled);
    return enabled
      ? 'Mode vim ACTIVE. i/a/o -> insert, ESC -> normal, : -> command, v -> visual.'
      : 'Mode vim desactive.';
  },
};
