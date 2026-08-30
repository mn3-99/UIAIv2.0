// agent/hooks/useDoublePress.ts
// Detection de double-appui (doc 13).

import { useRef } from 'react';
import { useInput } from 'ink';

export function useDoublePress(combo: string, handler: () => void, timeoutMs = 300): void {
  const lastPress = useRef(0);
  useInput((input, key) => {
    const name = (key as { name?: string }).name;
    const id = `${key.ctrl ? 'ctrl+' : ''}${name ?? input}`;
    if (id !== combo) return;
    const now = Date.now();
    if (now - lastPress.current < timeoutMs) {
      lastPress.current = 0;
      handler();
    } else {
      lastPress.current = now;
    }
  });
}
