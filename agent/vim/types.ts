// agent/vim/types.ts
// Types du mode vim (doc 13 : vim/).

export type VimMode = 'normal' | 'insert' | 'visual' | 'command';

export interface VimContext {
  mode: VimMode;
  buffer: string;
  cursor: number;
  pendingOperator?: string;
  commandBuffer?: string;
}

export interface VimAction {
  type: 'insert' | 'normal' | 'visual' | 'command' | 'submit' | 'noop' | 'set-buffer';
  payload?: string;
}
