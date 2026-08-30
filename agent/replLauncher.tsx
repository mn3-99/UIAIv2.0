// agent/replLauncher.tsx
// Lanceur du REPL (doc 02 + doc 06) : Ink renderer si TTY, readline sinon.
// Routage des commandes via le CommandRegistry (doc 05).

import * as readline from 'node:readline/promises';
import type { AgentContext } from './main';
import { createSession, getLastSession, loadSession, saveSession, type Session } from './history';
import { getCommandRegistry } from './commands';
import type { CommandContext } from './context';
import { ApiClient, type ChatMessage } from './services/api';
import { QueryEngine } from './QueryEngine';
import { getToolRegistry, type ToolRegistry } from './tools';
import { executeWithPermission } from './services/tools/StreamingToolExecutor';
import { track } from './services/analytics';
import { AGENT_VERSION } from './constants/index';
import type { ToolEvent } from './components/ToolProgress';
import { PermissionSystem, type PermissionMode, type PromptChoice } from './permissions/PermissionSystem';
import { promptPermissionReadline, denyByDefault } from './permissions/prompt';
import { createPermissionBus, type PermissionBus } from './permissions/bus';
import { loadConfig } from './setup';
import type { ToolCall } from './services/api';
import { recordDailyLog } from './memdir/memdir';
import { onSessionEnd } from './services/autoDream/autoDream';
import { printSessionSummary } from './costHook';

export interface ReplOptions {
  resume?: string;
  continueSession?: boolean;
}

/** Selection de session selon les arguments (doc 02 : gestion des sessions). */
function pickSession(opts: ReplOptions): Session {
  if (opts.resume) {
    const s = loadSession(opts.resume);
    if (s) return s;
    process.stderr.write(`uiai-agent: session '${opts.resume}' introuvable — nouvelle session.\n`);
  } else if (opts.continueSession) {
    const s = getLastSession();
    if (s) return s;
  }
  return createSession();
}

interface ReplDeps {
  ctx: AgentContext;
  session: Session;
  toolRegistry: ToolRegistry;
  api: ApiClient;
}

/** Construit le systeme de permissions (doc 08) selon le mode de config. */
function buildPermissionSystem(
  deps: ReplDeps,
  bus: PermissionBus,
  useInkDialog: boolean,
): PermissionSystem {
  const config = loadConfig();
  const mode = (config.permissionMode as PermissionMode) ?? 'default';
  const promptHandler = useInkDialog
    ? (req: Parameters<PermissionBus['ask']>[0]) => bus.ask(req)
    : (req: Parameters<typeof denyByDefault>[0]) => denyByDefault(req);
  return new PermissionSystem({ mode, registry: deps.toolRegistry, promptHandler });
}

/** Fabrique de QueryEngine cable aux callbacks UI + permissions (doc 03 + 08 + 10). */
function makeEngineFactory(deps: ReplDeps, perms: PermissionSystem, bridge?: import('./bridge/controller').BridgeController) {
  return (callbacks: { onDelta: (text: string) => void; onToolEvent: (event: ToolEvent) => void }) =>
    new QueryEngine({
      api: deps.api,
      tools: deps.toolRegistry.getSpecs(),
      executeTool: async (name, argsJson) => {
        const executed = await executeWithPermission(
          deps.toolRegistry,
          { id: `local-${Date.now()}`, type: 'function', function: { name, arguments: argsJson } },
          { workingDirectory: process.cwd(), sessionId: deps.session.id },
          async (call: ToolCall) => {
            // Doc 10 : si un client web est connecte, la permission passe par le bridge
            if (bridge?.hasClients) {
              const allowed = await bridge.requestPermission({
                name: call.function.name,
                args: call.function.arguments,
              });
              return allowed ? 'approved' : 'denied';
            }
            return perms.decide(call);
          },
        );
        return executed.result.content;
      },
      onDelta: (t) => {
        callbacks.onDelta(t);
        bridge?.sendAssistant(t);
      },
      onToolEvent: (e) => {
        callbacks.onToolEvent(e);
        if (e.status === 'start') bridge?.sendToolProgress(e.name, 'running');
        else bridge?.sendToolResult(e.name, e.detail ?? '');
      },
    });
}

function makeCommandContext(deps: ReplDeps, makeEngine: ReturnType<typeof makeEngineFactory>): CommandContext {
  return {
    agent: deps.ctx,
    session: deps.session,
    query: async (prompt) => {
      const engine = makeEngine({ onDelta: () => {}, onToolEvent: () => {} });
      const r = await engine.query(prompt, []);
      return r.text;
    },
    log: (msg) => process.stdout.write(`${msg}\n`),
    clearHistory: () => {
      deps.session.messages = [];
      saveSession(deps.session);
    },
    setVimMode: (enabled: boolean) => {
      deps.ctx.vimEnabled = enabled;
    },
  };
}

export async function launchRepl(ctx: AgentContext, opts: ReplOptions): Promise<void> {
  const session = pickSession(opts);
  const toolRegistry = await getToolRegistry();
  const api = new ApiClient({ baseUrl: ctx.baseUrl, apiKey: ctx.apiKey, model: ctx.model });
  const deps: ReplDeps = { ctx, session, toolRegistry, api };
  const bus = createPermissionBus();

  const useInk = process.stdin.isTTY && process.stdout.isTTY;
  const perms = buildPermissionSystem(deps, bus, useInk);
  const makeEngine = makeEngineFactory(deps, perms, ctx.bridge);

  // Doc 06 : renderer Ink quand le terminal est interactif, readline sinon.
  if (useInk) {
    const { renderRepl } = await import('./ink');
    const { createStore } = await import('./state/AppStateStore');
    const { initialAppState } = await import('./state/types');
    const store = createStore(initialAppState({ sessionId: session.id, model: ctx.model, offline: ctx.offline }));
    const commands = await getCommandRegistry();
    await renderRepl({ agentCtx: ctx, session, commands, store, makeEngine, permissionBus: bus });
    recordDailyLog(`Session terminee (mode: ${useInk ? 'ink' : 'readline'})`);
    await onSessionEnd(ctx.offline ? undefined : api);
    saveSession(session);
    printSessionSummary(ctx.model);
    return;
  }

  await launchReadlineRepl(deps, makeEngine);
}

/** REPL readline (fallback non-TTY : pipes, tests, CI). */
async function launchReadlineRepl(
  deps: ReplDeps,
  makeEngine: ReturnType<typeof makeEngineFactory>,
): Promise<void> {
  const { ctx, session } = deps;
  const commands = await getCommandRegistry();
  const cmdCtx = makeCommandContext(deps, makeEngine);

  process.stdout.write(`uiai-agent v${AGENT_VERSION} — session ${session.id}\n`);
  process.stdout.write('Tapez /help pour les commandes, /exit pour quitter.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (;;) {
      const line = (await rl.question('uiai> ')).trim();
      if (line === '') continue;

      const resolved = commands.resolve(line);
      if (resolved) {
        const { command, args } = resolved;
        if (command.name === 'exit') break;
        const available = commands.getAvailable(cmdCtx).some((c) => c.name === command.name);
        if (!available) {
          process.stdout.write(`Commande non disponible: /${command.name}\n`);
          continue;
        }
        try {
          const out = await command.run(args, cmdCtx);
          if (out) process.stdout.write(`${out}\n`);
        } catch (err) {
          process.stderr.write(`uiai-agent: erreur commande /${command.name}: ${err instanceof Error ? err.message : err}\n`);
        }
        continue;
      }
      if (line.startsWith('/')) {
        process.stdout.write(`Commande inconnue: ${line.split(/\s+/)[0]} (/help)\n`);
        continue;
      }

      if (ctx.offline) {
        process.stdout.write('[offline] requete non envoyee — serveur UIAI injoignable.\n');
        continue;
      }
      try {
        track('query', { length: line.length });
        const history: ChatMessage[] = session.messages;
        const result = await makeEngine({
          onDelta: (t) => process.stdout.write(t),
          onToolEvent: (e) => process.stderr.write(`\n[outil:${e.name}] ${e.status}\n`),
        }).query(line, history);
        process.stdout.write('\n');
        session.messages = result.messages.filter((m) => m.role !== 'system');
        saveSession(session);
      } catch (err) {
        process.stderr.write(`\nuiai-agent: echec de la requete: ${err instanceof Error ? err.message : err}\n`);
      }
    }
  } finally {
    saveSession(session);
    rl.close();
    printSessionSummary(ctx.model);
  }
}
