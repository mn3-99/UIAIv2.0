// agent/components/ToolProgress.tsx
// Progression des outils (doc 06 : ToolProgress).

import React from 'react';
import { Box, Text } from 'ink';

export interface ToolEvent {
  name: string;
  status: 'start' | 'done' | 'denied' | 'error';
  detail?: string;
}

const ICONS: Record<ToolEvent['status'], string> = {
  start: '⏳',
  done: '✓',
  denied: '⊘',
  error: '✗',
};

export function ToolProgress({ events }: { events: ToolEvent[] }): React.JSX.Element | null {
  if (events.length === 0) return null;
  const recent = events.slice(-5);
  return (
    <Box flexDirection="column" marginLeft={2}>
      {recent.map((e, i) => (
        <Text key={i} dimColor={e.status === 'done'} color={e.status === 'error' ? 'red' : e.status === 'denied' ? 'yellow' : undefined}>
          {ICONS[e.status]} {e.name}{e.detail ? ` — ${e.detail.slice(0, 80)}` : ''}
        </Text>
      ))}
    </Box>
  );
}
