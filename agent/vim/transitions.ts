// agent/vim/transitions.ts
// Transitions d'etat vim (doc 13 : vim/transitions).

import type { VimMode } from './types';
import { parseMotion, motionDelta } from './motions';
import { parseOperator } from './operators';
import { parseTextObject, textObjectRange } from './textObjects';

const ESC = String.fromCharCode(27);

export interface VimState {
  mode: VimMode;
  buffer: string;
  cursor: number;
  pendingOperator?: string;
  commandBuffer?: string;
}

export type VimAction = 'insert' | 'normal' | 'visual' | 'command' | 'submit' | 'noop';

export function transition(state: VimState, key: string): { state: VimState; action: VimAction } {
  if (state.mode === 'insert') {
    if (key === ESC) return { state: { ...state, mode: 'normal', pendingOperator: undefined }, action: 'normal' };
    return { state, action: 'noop' };
  }

  if (state.mode === 'command') {
    if (key === ESC) return { state: { ...state, mode: 'normal', commandBuffer: '' }, action: 'normal' };
    if (key === '\n' || key === '\r') {
      const cmd = (state.commandBuffer ?? '').trim();
      const next: VimState = { ...state, mode: 'normal', commandBuffer: '' };
      if (cmd === 'q') return { state: next, action: 'submit' };
      return { state: next, action: 'noop' };
    }
    return { state: { ...state, commandBuffer: (state.commandBuffer ?? '') + key }, action: 'noop' };
  }

  // Mode normal
  if (key === 'i' || key === 'a' || key === 'o') return { state: { ...state, mode: 'insert' }, action: 'insert' };
  if (key === 'v') return { state: { ...state, mode: 'visual' }, action: 'visual' };
  if (key === ':') return { state: { ...state, mode: 'command', commandBuffer: '' }, action: 'command' };
  if (key === ESC) return { state, action: 'normal' };

  const motion = parseMotion(key);
  if (motion) {
    const delta = motionDelta(motion, state.buffer, state.cursor);
    return {
      state: {
        ...state,
        pendingOperator: undefined,
        cursor: Math.max(0, Math.min(state.buffer.length, state.cursor + delta)),
      },
      action: 'noop',
    };
  }

  const op = parseOperator(key);
  if (op) {
    const obj = parseTextObject(key);
    if (obj) {
      const [s, e] = textObjectRange(obj, state.buffer, state.cursor);
      void s;
      void e;
    }
    return { state: { ...state, pendingOperator: op }, action: 'noop' };
  }

  return { state, action: 'noop' };
}
