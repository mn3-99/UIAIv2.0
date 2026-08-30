// agent/permissions/prompt.ts
// Dialogue de permission en mode non-TTY (readline) + fallback TTY minimal.

import * as readline from 'node:readline';
import type { PermissionRequest, PromptChoice } from './PermissionSystem';

/** Affiche la demande et lit un choix via readline sur stdin. */
export async function promptPermissionReadline(req: PermissionRequest): Promise<PromptChoice> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(`\n[uiai-agent] veut utiliser: ${req.tool}\n`);
  if (req.reason) process.stdout.write(`  → ${req.reason}\n`);
  if (req.risk !== 'LOW') process.stdout.write(`  → args: ${req.argString.slice(0, 300)}\n`);
  process.stdout.write('\n  [a] Autoriser  [s] Autoriser pour la session  [d] Refuser : ');

  return new Promise<PromptChoice>((resolve) => {
    rl.question('', (key) => {
      rl.close();
      const k = key.trim().toLowerCase();
      if (k === 'a') resolve('approve');
      else if (k === 's') resolve('approve_session');
      else resolve('deny');
    });
  });
}

/** Fallback quand aucun handler interactif n'est disponible. */
export async function denyByDefault(_req: PermissionRequest): Promise<PromptChoice> {
  process.stderr.write(`\n[uiai-agent] permission requise pour ${_req.tool} — refuse (non interactif).\n`);
  return 'deny';
}
