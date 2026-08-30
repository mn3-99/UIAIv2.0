// agent/commands/init.ts
// /init : configuration initiale du projet (doc 05) — cree un AGENTS.md de base.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from '../commands';

export const initCommand: Command = {
  name: 'init',
  description: 'Cree un AGENTS.md de base pour le projet courant',
  async run(_args, ctx) {
    const path = join(process.cwd(), 'AGENTS.md');
    if (existsSync(path)) return 'AGENTS.md existe deja.';

    const summary = await ctx.query(
      'Analyse brievement le projet dans le repertoire courant et propose 5 lignes ' +
      'd\'instructions pour un agent de code (stack, conventions, commandes de build/test). ' +
      'Reponds en markdown concis.',
    );
    const content = `# AGENTS.md\n\n${summary}\n`;
    await writeFile(path, content, 'utf-8');
    return `AGENTS.md cree (${content.length} caracteres).`;
  },
};
