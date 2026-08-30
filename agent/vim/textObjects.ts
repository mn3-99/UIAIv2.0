// agent/vim/textObjects.ts
// Objets texte vim (doc 13 : vim/textObjects).

export type TextObject = 'iw' | 'aw' | 'i"' | 'a"' | 'i{' | 'a{';

export function parseTextObject(token: string): TextObject | null {
  return (['iw', 'aw', 'i"', 'a"', 'i{', 'a{'] as TextObject[]).find((o) => o === token) ?? null;
}

/** Calcule la plage [start,end) pour un objet texte (doc 13). */
export function textObjectRange(obj: TextObject, buffer: string, cursor: number): [number, number] {
  if (obj === 'iw' || obj === 'aw') {
    let start = cursor;
    while (start > 0 && !/\s/.test(buffer[start - 1])) start--;
    let end = cursor;
    while (end < buffer.length && !/\s/.test(buffer[end])) end++;
    if (obj === 'aw') {
      while (end < buffer.length && /\s/.test(buffer[end])) end++;
    }
    return [start, end];
  }
  // Guillemets / accolades
  const open = obj.endsWith('"') ? '"' : '{';
  const start = buffer.lastIndexOf(open, cursor === 0 ? 0 : cursor - 1);
  if (start < 0) return [cursor, cursor];
  const close = open === '"' ? '"' : '}';
  const end = buffer.indexOf(close, start + 1);
  return [start, end < 0 ? buffer.length : end + 1];
}
