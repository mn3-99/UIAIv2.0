#!/usr/bin/env node
// agent/entrypoints/cli.tsx
// Point d'entree principal avec fast-paths (doc 02).

import { AGENT_VERSION, ENV } from '../constants/index';
import { mark, report, isDebug } from '../utils/startupProfiler';

mark('cli:start');

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // ── Fast-paths : operations legeres sans charger l'UI ──────────────
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${AGENT_VERSION}\n`);
    return;
  }

  if (args.includes('--dump-system-prompt')) {
    mark('fastpath:dump-system-prompt');
    const { getSystemPrompt } = await import('../query/systemPrompt');
    process.stdout.write(`${getSystemPrompt()}\n`);
    return;
  }

  if (args.includes('--daemon-worker') || process.env[ENV.DAEMON_WORKER]) {
    mark('fastpath:daemon-worker');
    const { runDaemonWorker } = await import('./daemonWorker');
    await runDaemonWorker(args);
    return;
  }

  if (args.includes('--bridge')) {
    mark('flag:bridge');
    process.env[ENV.BRIDGE] = '1';
  }

  // ── Mode normal : import dynamique de main.tsx (lazy loading) ──────
  mark('cli:import-main');
  const { run } = await import('../main');
  mark('cli:main-loaded');
  await run(args);

  if (isDebug()) {
    process.stderr.write(`${report()}\n`);
  }
}

main().catch((err: unknown) => {
  // Degradation gracieuse : message clair, code de sortie non nul (doc 02).
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`uiai-agent: erreur fatale au demarrage: ${msg}\n`);
  process.exitCode = 1;
});
