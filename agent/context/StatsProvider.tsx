// agent/context/StatsProvider.tsx
// Statistiques de session en temps reel (doc 07).

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { getSessionUsage } from '../cost-tracker';

export interface SessionStats {
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  toolEvents: number;
  durationMs: number;
}

const StatsContext = createContext<SessionStats | null>(null);

export function StatsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const state = useAppState();
  const stats = useMemo<SessionStats>(() => {
    const usage = getSessionUsage();
    return {
      messageCount: state.messages.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      requests: usage.requests,
      toolEvents: state.activeToolEvents.length,
      durationMs: Date.now() - state.startTime,
    };
  }, [state.messages.length, state.activeToolEvents.length, state.startTime]);
  return <StatsContext.Provider value={stats}>{children}</StatsContext.Provider>;
}

export function useStats(): SessionStats {
  const stats = useContext(StatsContext);
  if (!stats) throw new Error('useStats doit etre utilise sous <StatsProvider>');
  return stats;
}
