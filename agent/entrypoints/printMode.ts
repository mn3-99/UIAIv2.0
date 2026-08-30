// agent/entrypoints/printMode.ts
// Mode non-interactif : `uiai-agent -p "requete"` (doc 02) via QueryEngine (doc 03).

import type { AgentContext } from '../main';
import { ApiClient } from '../services/api';
import { QueryEngine } from '../QueryEngine';

export async function runPrintMode(ctx: AgentContext, query: string): Promise<void> {
  if (ctx.offline) {
    process.stderr.write('uiai-agent: mode offline — impossible de contacter le serveur.\n');
    process.exitCode = 1;
    return;
  }
  const api = new ApiClient({ baseUrl: ctx.baseUrl, apiKey: ctx.apiKey, model: ctx.model });
  const engine = new QueryEngine({ api });
  const result = await engine.query(query, []);
  process.stdout.write(`${result.text}\n`);
}
