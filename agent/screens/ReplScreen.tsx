// agent/screens/ReplScreen.tsx
// Ecran REPL principal (doc 06 + doc 07 : etat via AppState store).

import React, { useCallback, useMemo } from 'react';
import { Box, Text, useApp } from 'ink';
import type { AgentContext } from '../main';
import { saveSession, type Session } from '../history';
import type { CommandRegistry } from '../commands';
import type { CommandContext } from '../context';
import type { QueryEngine } from '../QueryEngine';
import type { ChatMessage } from '../services/api';
import type { Store } from '../state/AppStateStore';
import { useAppState } from '../state/AppState';
import type { AppState } from '../state/types';
import { PermissionDialog } from '../permissions/PermissionDialog';
import type { PermissionBus } from '../permissions/bus';
import type { PermissionRequest } from '../permissions/PermissionSystem';
import { useExitOnCtrlCD } from '../hooks/useExitOnCtrlCD';
import { useGlobalKeybindings } from '../hooks/useGlobalKeybindings';
import { MessageHistory, type DisplayMessage } from '../components/MessageHistory';
import { InputArea } from '../components/InputArea';
import { StatusBar } from '../components/StatusBar';
import { ToolProgress, type ToolEvent } from '../components/ToolProgress';
import { trackUsage, getSessionUsage } from '../cost-tracker';

export interface ReplScreenProps {
  agentCtx: AgentContext;
  session: Session;
  commands: CommandRegistry;
  store: Store<AppState>;
  permissionBus: PermissionBus;
  /** Fabrique un QueryEngine cable aux callbacks UI (streaming, outils). */
  makeEngine: (callbacks: {
    onDelta: (text: string) => void;
    onToolEvent: (event: ToolEvent) => void;
  }) => QueryEngine;
}

export function ReplScreen({ agentCtx, session, commands, store, permissionBus, makeEngine }: ReplScreenProps): React.JSX.Element {
  const { exit } = useApp();
  const state = useAppState();
  const [pendingPermission, setPendingPermission] = React.useState<PermissionRequest | null>(null);

  // Abonnement au bus de permissions (doc 08) : affiche le dialogue Ink.
  React.useEffect(() => {
    return permissionBus.onRequest((req) => {
      setPendingPermission(req);
    });
  }, [permissionBus]);

  // Doc 13 : raccourcis globaux (Ctrl+C/D quitter, Ctrl+L effacer, Esc annuler)
  useExitOnCtrlCD(() => {
    saveSession(session);
    exit();
  });
  useGlobalKeybindings({
    onClear: () => store.setState((s) => ({ messages: [] })),
    onCancel: () => store.setState(() => ({ busy: false, isStreaming: false, streamBuffer: '' })),
    onHistorySearch: () => store.setState((s) => ({ messages: [...s.messages, { id: `hs-${Date.now()}`, timestamp: Date.now(), type: 'progress', label: '[Ctrl+R] recherche historique (non implementee)' }] })),
  });

  const cmdCtx: CommandContext = useMemo(
    () => ({
      agent: agentCtx,
      session,
      query: async (prompt) => {
        const engine = makeEngine({ onDelta: () => {}, onToolEvent: () => {} });
        const r = await engine.query(prompt, []);
        return r.text;
      },
      log: (msg) =>
        store.setState((s) => ({
          messages: [...s.messages, { id: `sys-${Date.now()}`, timestamp: Date.now(), type: 'progress', label: msg }],
        })),
      clearHistory: () => {
        session.messages = [];
        saveSession(session);
      },
      setVimMode: (enabled: boolean) => store.setState(() => ({ vimEnabled: enabled, vimSubMode: 'insert' })),
    }),
    [agentCtx, session, makeEngine, store],
  );

  const pushDisplay = useCallback(
    (msg: DisplayMessage) => {
      store.setState((s) => ({
        messages: [
          ...s.messages,
          {
            id: `m-${Date.now()}-${s.messages.length}`,
            timestamp: Date.now(),
            ...(msg.role === 'user'
              ? { type: 'user' as const, content: msg.content }
              : msg.role === 'assistant'
                ? { type: 'assistant' as const, content: msg.content, model: agentCtx.model }
                : { type: 'progress' as const, label: msg.content }),
          },
        ],
      }));
    },
    [agentCtx.model, store],
  );

  const handleSubmit = useCallback(
    async (raw: string) => {
      const line = raw.trim();
      if (line === '') return;

      // Routage des commandes (doc 05)
      const resolved = commands.resolve(line);
      if (resolved) {
        const { command, args } = resolved;
        if (command.name === 'exit') {
          saveSession(session);
          exit();
          return;
        }
        const available = commands.getAvailable(cmdCtx).some((c) => c.name === command.name);
        if (!available) {
          pushDisplay({ role: 'system', content: `Commande non disponible: /${command.name}` });
          return;
        }
        store.setState(() => ({ busy: true }));
        try {
          const out = await command.run(args, cmdCtx);
          if (out) pushDisplay({ role: 'system', content: out });
        } catch (err) {
          pushDisplay({ role: 'system', content: `erreur /${command.name}: ${err instanceof Error ? err.message : err}` });
        } finally {
          store.setState(() => ({ busy: false }));
        }
        return;
      }
      if (line.startsWith('/')) {
        pushDisplay({ role: 'system', content: `Commande inconnue: ${line.split(/\s+/)[0]} (/help)` });
        return;
      }

      pushDisplay({ role: 'user', content: line });
      if (agentCtx.offline) {
        pushDisplay({ role: 'system', content: '[offline] requete non envoyee — serveur UIAI injoignable.' });
        return;
      }

      store.setState(() => ({ busy: true, isStreaming: true, streamBuffer: '', activeToolEvents: [] }));
      try {
        const engine = makeEngine({
          onDelta: (t) => store.setState((s) => ({ streamBuffer: s.streamBuffer + t })),
          onToolEvent: (e) => store.setState((s) => ({ activeToolEvents: [...s.activeToolEvents, e] })),
        });
        const history: ChatMessage[] = session.messages;
        const result = await engine.query(line, history);
        session.messages = result.messages.filter((m) => m.role !== 'system');
        saveSession(session);
        trackUsage({ input_tokens: 0, output_tokens: 0 }); // usage deja tracke par le moteur
        store.setState(() => ({ streamBuffer: '' }));
        pushDisplay({ role: 'assistant', content: result.text || '(reponse vide)' });
        const u = getSessionUsage();
        store.setState(() => ({ costState: { inputTokens: u.inputTokens, outputTokens: u.outputTokens, requests: u.requests } }));
      } catch (err) {
        pushDisplay({ role: 'system', content: `echec de la requete: ${err instanceof Error ? err.message : err}`, isError: true });
      } finally {
        store.setState(() => ({ busy: false, isStreaming: false, streamBuffer: '' }));
      }
    },
    [agentCtx.offline, cmdCtx, commands, exit, makeEngine, pushDisplay, session, store],
  );

  // Doc 10 : integration bridge — injection des messages web + sync d'etat.
  const submitRef = React.useRef(handleSubmit);
  submitRef.current = handleSubmit;
  React.useEffect(() => {
    const bridge = agentCtx.bridge;
    if (!bridge) return;
    bridge.setUserMessageHandler((text) => void submitRef.current(text));
    const unsub = store.subscribe((s) => {
      bridge.sendStatus({
        messages: s.messages.length,
        isStreaming: s.isStreaming,
        activeTools: s.activeToolEvents.length,
        sessionState: s.busy ? 'TOOL_EXECUTING' : s.isStreaming ? 'STREAMING' : 'ACTIVE',
      });
    });
    return () => {
      unsub();
    };
  }, [agentCtx.bridge, store]);

  // Adaptation Message -> DisplayMessage pour l'affichage (doc 07 : types)
  const displayMessages: DisplayMessage[] = state.messages.map((m) => {
    switch (m.type) {
      case 'user':
        return { role: 'user', content: m.content };
      case 'assistant':
        return { role: 'assistant', content: m.content };
      case 'tool_use_summary':
        return { role: 'tool', content: m.summary };
      case 'system_command':
        return { role: 'tool', content: m.output };
      case 'tombstone':
        return { role: 'system', content: '[message ancien supprime]' };
      default:
        return { role: 'system', content: m.label };
    }
  });

  return (
    <Box flexDirection="column">
      <MessageHistory messages={displayMessages} />
      {state.streamBuffer !== '' && (
        <Box marginTop={1}>
          <Text>{state.streamBuffer}</Text>
        </Box>
      )}
      <ToolProgress events={state.activeToolEvents} />
      {pendingPermission ? (
        <PermissionDialog
          request={pendingPermission}
          onChoice={(choice) => {
            setPendingPermission(null);
            permissionBus.resolve(choice);
          }}
        />
      ) : (
        <InputArea
          disabled={state.busy}
          onSubmit={(v) => void handleSubmit(v)}
          vimEnabled={state.vimEnabled}
          vimSubMode={state.vimSubMode}
          onVimSubModeChange={(mode) => store.setState(() => ({ vimSubMode: mode }))}
        />
      )}
      <StatusBar
        sessionId={state.sessionId}
        model={state.currentModel}
        offline={state.offline}
        busy={state.busy}
        messageCount={state.messages.length}
      />
    </Box>
  );
}
