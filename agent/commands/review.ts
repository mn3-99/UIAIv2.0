// agent/commands/review.ts
// /review : revue de code des changements en cours (doc 05).

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Command } from '../commands';

const execAsync = promisify(exec);

export const reviewCommand: Command = {
  name: 'review',
  description: 'Revue de code des changements git (staged ou working tree)',
  async run(_args, ctx) {
    let diff = '';
    try {
      const { stdout } = await execAsync('git diff --staged', { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024 });
      diff = stdout;
      if (!diff.trim()) {
        const res = await execAsync('git diff', { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024 });
        diff = res.stdout;
      }
    } catch {
      return 'Pas de depot git ici.';
    }
    if (!diff.trim()) return 'Aucun changement a revoir.';

    return ctx.query(
      [
        'Fais une revue de code concise de ce diff. Liste les problemes par severite',
        '(critique/majeur/mineur) puis donne 1-3 suggestions. Reponds en francais.',
        '',
        diff.slice(0, 12000),
      ].join('\n'),
    );
  },
};
