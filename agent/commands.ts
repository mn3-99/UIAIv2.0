// agent/commands.ts
// Registre central des commandes (doc 05) : import, filtrage par disponibilite
// et feature flags, resolution par nom/alias, plugins externes.

import type { CommandContext } from './context';
import { feature, type FeatureFlag } from './utils/feature';
import { loadPlugins } from './plugins/index';

import { helpCommand } from './commands/help';
import { versionCommand, statusCommand, exitCommand, clearCommand } from './commands/basics';
import { commitCommand } from './commands/commit';
import { reviewCommand } from './commands/review';
import { initCommand } from './commands/init';
import { compactCommand, costCommand, contextCommand, tasksCommand, resumeCommand } from './commands/session';
import { configCommand } from './commands/config';
import { permissionsCommand } from './commands/permissions';
import { memoryCommand } from './commands/memory';
import { vimCommand } from './commands/vim';
import { keybindingsCommand } from './commands/keybindings';
import { bridgeCommand, voiceCommand, proactiveCommand } from './commands/gated';

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** Feature flag requis pour que la commande soit disponible (doc 05). */
  featureGate?: FeatureFlag;
  /** Commande interne (non exposee aux utilisateurs standard). */
  internalOnly?: boolean;
  /** Disponibilite dynamique selon le contexte (doc 05 : isAvailable). */
  isAvailable?: (ctx: CommandContext) => boolean;
  run: (args: string, ctx: CommandContext) => Promise<string | null> | string | null;
}

/** Toutes les commandes integrees (doc 05 : categories). */
const ALL_COMMANDS: Command[] = [
  // Fondamentales (toujours disponibles)
  helpCommand,
  versionCommand,
  statusCommand,
  exitCommand,
  clearCommand,
  commitCommand,
  reviewCommand,
  initCommand,
  compactCommand,
  costCommand,
  contextCommand,
  tasksCommand,
  resumeCommand,
  configCommand,
  permissionsCommand,
  memoryCommand,
  vimCommand,
  keybindingsCommand,
  // Conditionnelles (feature gates)
  bridgeCommand,
  voiceCommand,
  proactiveCommand,
];

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): void {
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases ?? []) {
      this.commands.set(alias, cmd);
    }
  }

  resolve(input: string): { command: Command; args: string } | null {
    if (!input.startsWith('/')) return null;
    const [name, ...rest] = input.slice(1).split(/\s+/);
    const command = this.commands.get(name);
    return command ? { command, args: rest.join(' ') } : null;
  }

  /** Filtrage dynamique : flags + internalOnly + isAvailable (doc 05). */
  getAvailable(ctx: CommandContext): Command[] {
    const unique = new Map<string, Command>();
    for (const cmd of this.commands.values()) unique.set(cmd.name, cmd);
    return [...unique.values()].filter((cmd) => {
      if (cmd.internalOnly) return false;
      if (cmd.featureGate && !feature(cmd.featureGate)) return false;
      if (cmd.isAvailable && !cmd.isAvailable(ctx)) return false;
      return true;
    });
  }
}

let registry: CommandRegistry | null = null;

/** Charge le registre : commandes integrees + plugins externes (doc 05). */
export async function getCommandRegistry(): Promise<CommandRegistry> {
  if (registry) return registry;
  registry = new CommandRegistry();
  for (const cmd of ALL_COMMANDS) registry.register(cmd);
  for (const plugin of await loadPlugins()) {
    registry.register(plugin as Command);
  }
  return registry;
}

export function resetCommandRegistry(): void {
  registry = null;
}
