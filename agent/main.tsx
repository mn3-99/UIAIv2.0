// agent/main.tsx
// Orchestration principale (doc 02) : sequence d'initialisation du demarrage.

import { loadConfig, resolveApiKey, type AgentConfig } from './setup';
import { mark } from './utils/startupProfiler';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, ENV } from './constants/index';

export interface AgentContext {
  args: string[];
  config: AgentConfig;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  offline: boolean;
  vimEnabled: boolean;
  bridge?: import('./bridge/controller').BridgeController;
}

/** Parse minimal des arguments CLI (doc 02 etape 1). */
export function parseArgs(args: string[]): {
  resume?: string;
  continueSession?: boolean;
  print?: boolean;
  query?: string;
  rest: string[];
} {
  const out: ReturnType<typeof parseArgs> = { rest: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--resume' || a === '-r') out.resume = args[++i];
    else if (a === '--continue' || a === '-c') out.continueSession = true;
    else if (a === '--print' || a === '-p') out.print = true;
    else if (!a.startsWith('-') && out.query === undefined) out.query = a;
    else out.rest.push(a);
  }
  return out;
}

/**
 * Sequence d'initialisation (doc 02) :
 * args -> telemetry -> feature flags -> auth -> config -> registres -> REPL.
 */
export async function run(argv: string[]): Promise<void> {
  // 1. Parse des arguments
  const parsed = parseArgs(argv);
  mark('main:args-parsed');

  // 2. Telemetrie + analytics (service leger, doc 12 l'etendra)
  const { initTelemetry } = await import('./services/analytics');
  initTelemetry();
  mark('main:telemetry');

  // 3. Prefetch credentials — pas de keychain macOS ici ; lecture .env du projet
  mark('main:credentials');

  // 4. Feature flags (cache local acceptable si indisponible — doc 14)
  const { loadFeatureFlags } = await import('./utils/feature');
  await loadFeatureFlags();
  mark('main:feature-flags');

  // 5-6. Auth + configuration (degradation gracieuse, doc 02)
  const config = loadConfig();
  const apiKey = resolveApiKey();
  const ctx: AgentContext = {
    args: parsed.rest,
    config,
    baseUrl: process.env[ENV.BASE_URL] ?? config.baseUrl ?? DEFAULT_BASE_URL,
    model: process.env[ENV.MODEL] ?? config.model ?? DEFAULT_MODEL,
    apiKey,
    offline: false,
    vimEnabled: false,
  };
  mark('main:config');

  // Verification reseau legere : mode offline limite si le serveur est injoignable
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`${ctx.baseUrl}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
  } catch {
    ctx.offline = true;
    process.stderr.write('uiai-agent: serveur UIAI injoignable — mode offline (lecture seule).\n');
  }
  mark('main:health');

  // 7-8. Registres commandes + outils (docs 04/05 — chargement paresseux)
  const { getToolRegistry } = await import('./tools');
  await getToolRegistry();
  mark('main:tools');
  const { getCommandRegistry } = await import('./commands');
  await getCommandRegistry();
  mark('main:commands');

  // 9. Serveurs MCP configures (doc 04/12 — branche ulterieurement)

  // 9b. Bridge (doc 10) : demarre le serveur WS si active
  if (process.env[ENV.BRIDGE] === '1') {
    const { runBridge } = await import('./bridge/index');
    ctx.bridge = await runBridge({ mode: 'single-session' });
  }

  // 10. Lancement du REPL (doc 02) / mode print non-interactif
  const { launchRepl } = await import('./replLauncher');
  if (parsed.print && parsed.query !== undefined) {
    mark('main:print-mode');
    const { runPrintMode } = await import('./entrypoints/printMode');
    await runPrintMode(ctx, parsed.query);
    return;
  }
  mark('main:repl');
  await launchRepl(ctx, { resume: parsed.resume, continueSession: parsed.continueSession });
}
