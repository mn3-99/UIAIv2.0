// agent/components/MarkdownRenderer.tsx
// Rendu Markdown simplifie dans le terminal (doc 06 : MarkdownRenderer).

import React from 'react';
import { Text } from 'ink';

/** Rendu ligne par ligne : titres, code inline, gras basique. */
export function MarkdownRenderer({ content }: { content: string }): React.JSX.Element {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('```')) {
          return <Text key={i} dimColor>{line}</Text>;
        }
        if (line.startsWith('#')) {
          return <Text key={i} bold color="cyan">{line.replace(/^#+\s*/, '')}</Text>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <Text key={i}>  • {line.slice(2)}</Text>;
        }
        return <Text key={i}>{line}</Text>;
      })}
    </>
  );
}
