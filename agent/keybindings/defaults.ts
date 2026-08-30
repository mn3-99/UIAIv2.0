// agent/keybindings/defaults.ts
// Raccourcis par defaut (doc 13).

export interface Keybinding {
  keys: string; // ex: "ctrl+l" ou "ctrl+k,ctrl+c" (chord)
  command: string;
  type?: 'chord';
}

export const DEFAULT_BINDINGS: Keybinding[] = [
  { keys: 'enter', command: 'submit' },
  { keys: 'ctrl+c', command: 'cancel' },
  { keys: 'ctrl+d', command: 'quit' },
  { keys: 'ctrl+l', command: 'clear-screen' },
  { keys: 'ctrl+r', command: 'history-search' },
  { keys: 'up', command: 'history-prev' },
  { keys: 'down', command: 'history-next' },
  { keys: 'escape', command: 'cancel-action' },
  { keys: 'tab', command: 'complete' },
  { keys: 'ctrl+z', command: 'undo' },
  { keys: 'ctrl+k,ctrl+c', command: 'commit', type: 'chord' },
  { keys: 'ctrl+shift+p', command: 'command-palette' },
];
