// agent/components/InputArea.tsx
// Zone de saisie (doc 06 : InputArea). Gere l'historique local des entrees
// (fleche haut) et la soumission avec Entree. Supporte le mode vim (doc 13).

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VimMode } from '../vim';

export interface InputAreaProps {
  disabled: boolean;
  onSubmit: (value: string) => void;
  vimEnabled?: boolean;
  vimSubMode?: VimMode;
  onVimSubModeChange?: (mode: VimMode) => void;
}

const ESC = String.fromCharCode(27);

export function InputArea({ disabled, onSubmit, vimEnabled = false, vimSubMode = 'insert', onVimSubModeChange }: InputAreaProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key) => {
    if (disabled) return;

    // Mode vim : en dehors d'insert, les touches sont des commandes vim (doc 13)
    if (vimEnabled && vimSubMode !== 'insert') {
      const vk = key.escape ? ESC : input;
      if (vk === 'i' || vk === 'a' || vk === 'o') {
        onVimSubModeChange?.('insert');
      } else if (vk === 'v') {
        onVimSubModeChange?.('visual');
      } else if (vk === ':') {
        onVimSubModeChange?.('command');
      } else if (key.escape) {
        onVimSubModeChange?.('normal');
      }
      // En mode vim non-insert, Entree ne soumet pas (sauf :q en command)
      return;
    }

    // Certains pty traduisent CR->NL (icrnl) et le collage/pipe arrive en un
    // seul chunk multi-lignes : on soumet chaque ligne complete.
    if (key.return || input.includes('\r') || input.includes('\n')) {
      const segments = input.split(/\r\n|\r|\n/);
      const endsWithNewline = /[\r\n]$/.test(input) || key.return;
      let pending = value;
      const complete = endsWithNewline ? segments : segments.slice(0, -1);
      const lastPartial = endsWithNewline ? '' : segments[segments.length - 1];
      for (const seg of complete) {
        const v = pending + seg;
        pending = '';
        if (v.trim() !== '') {
          setHistory((h) => [...h, v]);
          setHistoryIndex(-1);
          onSubmit(v);
        }
      }
      setValue(pending + lastPartial);
      return;
    }
    if (key.upArrow) {
      if (history.length === 0) return;
      const next = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setValue(history[next]);
      return;
    }
    if (key.downArrow) {
      if (historyIndex === -1) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setValue('');
      } else {
        setHistoryIndex(next);
        setValue(history[next]);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta) return; // raccourcis geres ailleurs (doc 13)
    if (input) setValue((v) => v + input);
  });

  return (
    <Box borderStyle="round" borderColor={disabled ? 'gray' : 'blue'} paddingX={1}>
      <Text color={disabled ? 'gray' : undefined}>
        {'> '}{value}
        {!disabled && <Text inverse> </Text>}
      </Text>
    </Box>
  );
}
