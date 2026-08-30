// agent/vim/index.ts
// Point d'entree du mode vim (doc 13).

export { transition, type VimState, type VimAction } from './transitions';
export { parseMotion, motionDelta } from './motions';
export { parseOperator, describeOperator } from './operators';
export { parseTextObject, textObjectRange } from './textObjects';
export type { VimMode } from './types';
