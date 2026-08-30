// agent/ink.ts
// Point d'entree Ink (doc 06) + hierarchie des providers (doc 07) :
// AppStateProvider > StatsProvider > NotificationProvider > MailboxProvider.

import React from 'react';
import { render } from 'ink';
import type { ReplScreenProps } from './screens/ReplScreen';
import { ReplScreen } from './screens/ReplScreen';
import type { PermissionBus } from './permissions/bus';
import { AppStateProvider } from './state/AppState';
import { StatsProvider } from './context/StatsProvider';
import { NotificationProvider } from './context/NotificationProvider';
import { MailboxProvider } from './context/MailboxProvider';
import { attachStateListeners, setTerminalTitle } from './state/onChangeAppState';
import { saveSession } from './history';

/** Monte le REPL Ink et resout quand l'utilisateur quitte (/exit ou Ctrl+C). */
export async function renderRepl(props: ReplScreenProps & { permissionBus: PermissionBus }): Promise<void> {
  // Effets secondaires sur changement d'etat (doc 07 : onChangeAppState)
  const detach = attachStateListeners(props.store, {
    onMessagesChange: () => saveSession(props.session),
    onModelChange: (model) => setTerminalTitle(`uiai-agent - ${model}`),
  });
  setTerminalTitle(`uiai-agent - ${props.agentCtx.model}`);

  const tree = (
    <AppStateProvider store={props.store}>
      <StatsProvider>
        <NotificationProvider>
          <MailboxProvider>
            <ReplScreen {...props} />
          </MailboxProvider>
        </NotificationProvider>
      </StatsProvider>
    </AppStateProvider>
  );

  const { waitUntilExit } = render(tree);
  await waitUntilExit();
  detach();
}
