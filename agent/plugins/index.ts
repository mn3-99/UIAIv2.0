// agent/plugins/index.ts
// Systeme de plugins (doc 05) : charge des commandes externes depuis
// ~/.uiai-agent/plugins/*.mjs (modules ESM exportant un objet Command).

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configDir } from '../setup';

export interface PluginCommand {
  name: string;
  aliases?: string[];
  description: string;
  run: (args: string, ctx: unknown) => Promise<string | null> | string | null;
}

export async function loadPlugins(): Promise<PluginCommand[]> {
  const dir = join(configDir(), 'plugins');
  if (!existsSync(dir)) return [];
  const plugins: PluginCommand[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    try {
      const mod = (await import(pathToFileURL(join(dir, file)).href)) as { default?: PluginCommand };
      if (mod.default?.name && typeof mod.default.run === 'function') {
        plugins.push(mod.default);
      }
    } catch (err) {
      process.stderr.write(`uiai-agent: plugin '${file}' ignore (${err instanceof Error ? err.message : err})\n`);
    }
  }
  return plugins;
}
