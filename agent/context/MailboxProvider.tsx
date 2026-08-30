// agent/context/MailboxProvider.tsx
// Messagerie inter-composants (doc 07 : MailboxProvider).

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface MailboxMessage {
  channel: string;
  payload: unknown;
  at: number;
}

type MailboxListener = (msg: MailboxMessage) => void;

const listeners = new Map<string, Set<MailboxListener>>();

function deliver(msg: MailboxMessage): void {
  for (const l of listeners.get(msg.channel) ?? []) l(msg);
  for (const l of listeners.get('*') ?? []) l(msg);
}

interface MailboxApi {
  send: (channel: string, payload: unknown) => void;
}

const MailboxContext = createContext<MailboxApi | null>(null);

export function MailboxProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const send = useCallback((channel: string, payload: unknown) => {
    deliver({ channel, payload, at: Date.now() });
  }, []);
  return <MailboxContext.Provider value={{ send }}>{children}</MailboxContext.Provider>;
}

/** Composant emetteur : useMailbox() sans canal. */
export function useMailbox(): MailboxApi;
/** Composant recepteur : useMailbox('channel') -> messages recus. */
export function useMailbox(channel: string): MailboxMessage[];
export function useMailbox(channel?: string): MailboxApi | MailboxMessage[] {
  const api = useContext(MailboxContext);
  const [received, setReceived] = useState<MailboxMessage[]>([]);

  useEffect(() => {
    if (!channel) return;
    const listener: MailboxListener = (msg) => setReceived((list) => [...list.slice(-49), msg]);
    const set = listeners.get(channel) ?? new Set<MailboxListener>();
    set.add(listener);
    listeners.set(channel, set);
    return () => {
      set.delete(listener);
    };
  }, [channel]);

  if (!api) throw new Error('useMailbox doit etre utilise sous <MailboxProvider>');
  return channel === undefined ? api : received;
}
