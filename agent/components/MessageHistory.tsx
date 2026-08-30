// agent/components/MessageHistory.tsx
// Affichage de la conversation (doc 06 : composants principaux).

import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface DisplayMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  isError?: boolean;
}

export function MessageHistory({ messages }: { messages: DisplayMessage[] }): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {messages.map((m, i) => {
        switch (m.role) {
          case 'user':
            return (
              <Box key={i} marginTop={1}>
                <Text bold color="green">{'> '}</Text>
                <Text>{m.content}</Text>
              </Box>
            );
          case 'assistant':
            return (
              <Box key={i} flexDirection="column" marginTop={1}>
                <MarkdownRenderer content={m.content} />
              </Box>
            );
          case 'tool':
            return (
              <Box key={i} marginLeft={2}>
                <Text dimColor={!m.isError} color={m.isError ? 'red' : undefined}>
                  {m.isError ? '✗' : '⚙'} {m.content.split('\n')[0].slice(0, 120)}
                </Text>
              </Box>
            );
          default:
            return (
              <Box key={i}>
                <Text dimColor>{m.content}</Text>
              </Box>
            );
        }
      })}
    </Box>
  );
}
