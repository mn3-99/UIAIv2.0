// agent/commands/config.ts
// /config : consultation/modification des parametres (doc 05).

import type { Command } from '../commands';
import { loadConfig, saveConfig } from '../setup';

export const configCommand: Command = {
  name: 'config',
  description: 'Affiche ou modifie la configuration (/config set cle valeur)',
  run: (args) => {
    const cfg = loadConfig();
    const [sub, key, ...rest] = args.trim().split(/\s+/);
    if (!sub || sub === 'list') {
      return JSON.stringify(cfg, null, 2);
    }
    if (sub === 'set' && key) {
      cfg[key] = rest.join(' ');
      saveConfig(cfg);
      return `config: ${key} = ${cfg[key]}`;
    }
    return 'Usage: /config [list] | /config set <cle> <valeur>';
  },
};
