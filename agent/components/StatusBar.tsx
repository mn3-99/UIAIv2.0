// agent/components/StatusBar.tsx
// Barre d'etat en bas de l'ecran (doc 06).

import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
  sessionId: string;
  model: string;
  offline: boolean;
  busy: boolean;
  messageCount: number;
}

export function StatusBar({ sessionId, model, offline, busy, messageCount }: StatusBarProps): React.JSX.Element {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text dimColor>session {sessionId.slice(0, 8)} · {messageCount} msg</Text>
      <Text dimColor>{busy ? 'generation…' : 'pret'}</Text>
      <Text color={offline ? 'red' : 'green'}>{offline ? 'offline' : model}</Text>
    </Box>
  );
}
