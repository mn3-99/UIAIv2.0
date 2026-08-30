// agent/commands/commit.ts
// /commit : generation de message de commit par l'IA + git commit (doc 05).
// Securite : ne fait JAMAIS de push (regle du proprietaire du projet).

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Command } from '../commands';

const execAsync = promisify(exec);

async function git(args: string): Promise<string> {
  const { stdout } = await execAsync(`git ${args}`, { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

export const commitCommand: Command = {
  name: 'commit',
  aliases: ['c'],
  description: 'Genere un message de commit par l\'IA et cree le commit (sans push)',
  async run(args, ctx) {
    const diff = await git('diff --staged');
    if (!diff) return 'Aucun changement stage. Faites d\'abord: git add <fichiers>';

    const recent = await git('log --oneline -10').catch(() => '');
    const message = await ctx.query(
      [
        'Genere un message de commit concis (une ligne) pour ces changements.',
        'Reponds UNIQUEMENT avec le message, sans explication.',
        '',
        'Diff:',
        diff.slice(0, 8000),
        '',
        'Style des commits recents:',
        recent,
      ].join('\n'),
    );
    const clean = message.trim().split('\n')[0].replace(/["`]/g, "'");

    if (args.includes('--dry-run')) return `Message propose: ${clean}`;

    await git(`commit -m ${JSON.stringify(clean)}`);
    return `Commit cree: ${clean}`;
  },
};
