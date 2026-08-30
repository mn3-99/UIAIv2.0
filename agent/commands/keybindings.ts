// agent/commands/keybindings.ts
// /keybindings : liste les raccourcis configures (doc 13).

import type { Command } from '../commands';
import { keybindings } from '../keybindings/keybindings';

export const keybindingsCommand: Command = {
  name: 'keybindings',
  description: 'List configured keybindings.',
  async run() {
    keybindings.loadUserConfig();
    const list = keybindings.list();
    if (list.length === 0) return '(aucun raccourci)';
    return list.map((b) => `${b.keys.padEnd(16)} -> ${b.command}`).join('\n');
  },
};
