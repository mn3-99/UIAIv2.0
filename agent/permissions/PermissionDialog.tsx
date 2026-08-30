// agent/permissions/PermissionDialog.tsx
// Dialogue de permission interactif pour le renderer Ink (doc 06 + doc 08).

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PermissionRequest, PromptChoice } from './PermissionSystem';

export interface PermissionDialogProps {
  request: PermissionRequest;
  onChoice: (choice: PromptChoice) => void;
}

export function PermissionDialog({ request, onChoice }: PermissionDialogProps): React.JSX.Element {
  const [hover, setHover] = useState(0);
  const options: PromptChoice[] = ['approve', 'approve_session', 'deny'];
  const labels: Record<PromptChoice, string> = {
    approve: 'Autoriser',
    approve_session: 'Autoriser (session)',
    deny: 'Refuser',
  };

  useInput((input, key) => {
    if (key.upArrow) setHover((h) => (h + options.length - 1) % options.length);
    else if (key.downArrow) setHover((h) => (h + 1) % options.length);
    else if (key.return || input === '\n' || input === '\r') onChoice(options[hover]);
    else if (input === 'a') onChoice('approve');
    else if (input === 's') onChoice('approve_session');
    else if (input === 'd') onChoice('deny');
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">Permission requise : {request.tool} ({request.risk})</Text>
      {request.reason && <Text dimColor>{request.reason}</Text>}
      {request.risk !== 'LOW' && (
        <Text dimColor>{request.argString.slice(0, 200)}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Text key={opt} color={i === hover ? 'cyan' : undefined}>
            {i === hover ? '▶ ' : '  '}
            {labels[opt]}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
