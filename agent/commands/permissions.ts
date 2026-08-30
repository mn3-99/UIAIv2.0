// agent/commands/permissions.ts
// /permissions : consulte/change le mode (default/auto/bypass) (doc 08).

import type { Command } from '../commands';
import type { PermissionMode } from '../permissions/PermissionSystem';
import { loadConfig, saveConfig } from '../setup';

export const permissionsCommand: Command = {
  name: 'permissions',
  description: 'Gere le mode de permissions: default | auto | bypass',
  run: (args, ctx) => {
    const [sub, mode] = args.trim().split(/\s+/);
    if (!sub || sub === 'status') {
      const cfg = loadConfig();
      return `Mode de permissions: ${cfg.permissionMode ?? 'default'}`;
    }
    if (sub === 'set' && mode) {
      if (!['default', 'auto', 'bypass'].includes(mode)) {
        return 'Mode invalide. Valeurs: default, auto, bypass';
      }
      const cfg = loadConfig();
      cfg.permissionMode = mode as PermissionMode;
      saveConfig(cfg);
      return `Mode de permissions -> ${mode}`;
    }
    return 'Usage: /permissions [status] | /permissions set <default|auto|bypass>';
  },
};
