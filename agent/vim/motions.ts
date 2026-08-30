// agent/vim/motions.ts
// Mouvements vim (doc 13 : vim/motions).

export type Motion = 'w' | 'b' | 'e' | '$' | '0' | 'gg' | 'G' | 'h' | 'l';

export function parseMotion(token: string): Motion | null {
  const map: Record<string, Motion> = { w: 'w', b: 'b', e: 'e', $: '$', '0': '0', gg: 'gg', G: 'G', h: 'h', l: 'l' };
  return map[token] ?? null;
}

/** Calcule le deplacement du curseur pour un mouvement (doc 13). */
export function motionDelta(motion: Motion, buffer: string, cursor: number): number {
  switch (motion) {
    case '0':
      return -cursor;
    case '$':
      return buffer.length - cursor;
    case 'h':
      return Math.max(-cursor, -1);
    case 'l':
      return Math.min(buffer.length - cursor, 1);
    case 'w':
      return nextWord(buffer, cursor) - cursor;
    case 'b':
      return cursor - prevWord(buffer, cursor);
    case 'e':
      return wordEnd(buffer, cursor) - cursor;
    case 'gg':
      return -cursor;
    case 'G':
      return buffer.length - cursor;
    default:
      return 0;
  }
}

function nextWord(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j++;
  while (j < s.length && !/\s/.test(s[j])) j++;
  return Math.min(j, s.length);
}
function prevWord(s: string, i: number): number {
  let j = i;
  while (j > 0 && /\s/.test(s[j - 1])) j--;
  while (j > 0 && !/\s/.test(s[j - 1])) j--;
  return Math.max(0, j);
}
function wordEnd(s: string, i: number): number {
  let j = Math.max(i, 0);
  while (j < s.length && /\s/.test(s[j])) j++;
  while (j < s.length && !/\s/.test(s[j])) j++;
  return Math.max(0, Math.min(j - 1, s.length - 1));
}
