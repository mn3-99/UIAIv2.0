// agent/keybindings/parser.ts
// Parsing des sequences de touches (doc 13).

export interface KeyCombo {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  key: string;
}

/** Parse "ctrl+l" ou "ctrl+k,ctrl+c" (chord) en tableau de combos. */
export function parseBinding(binding: string): KeyCombo[][] {
  return binding.split(',').map((chordPart) =>
    chordPart.split('+').map((part) => {
      const lower = part.trim().toLowerCase();
      const combo: KeyCombo = { key: '' };
      if (lower === 'ctrl' || lower === 'control') combo.ctrl = true;
      else if (lower === 'meta' || lower === 'cmd' || lower === 'alt') combo.meta = true;
      else if (lower === 'shift') combo.shift = true;
      else combo.key = lower;
      return combo;
    }),
  );
}

/** Convertit un evenement ink (input,key) en identifiant de combo. */
export function eventToCombo(input: string, key: Record<string, boolean>): KeyCombo {
  return {
    ctrl: key.ctrl,
    meta: key.meta || key.alt,
    shift: key.shift,
    key: input.toLowerCase() || (key as Record<string, unknown>).name?.toString?.() || '',
  };
}

/** Compare deux combos. */
export function matchesCombo(a: KeyCombo, b: KeyCombo): boolean {
  return !!a.ctrl === !!b.ctrl && !!a.meta === !!b.meta && !!a.shift === !!b.shift && a.key === b.key;
}
