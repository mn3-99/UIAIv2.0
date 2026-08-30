// agent/vim/operators.ts
// Operateurs vim (doc 13 : vim/operators).

export type Operator = 'd' | 'c' | 'y' | 'p';

export function parseOperator(token: string): Operator | null {
  return (['d', 'c', 'y', 'p'] as Operator[]).find((o) => o === token) ?? null;
}

/** Description de l'effet d'un operateur (doc 13). */
export function describeOperator(op: Operator): string {
  switch (op) {
    case 'd': return 'supprimer';
    case 'c': return 'changer';
    case 'y': return 'copier (yank)';
    case 'p': return 'coller';
  }
}
