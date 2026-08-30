// agent/permissions/bus.ts
// Bus de demande de permission pour le renderer Ink (doc 06 + doc 08).
// Le QueryEngine appelle `ask(req)` (retourne une promesse); le composant Ink
// s'abonne via `onRequest` et resout via `resolve(choice)`.

import type { PermissionRequest, PromptChoice } from './PermissionSystem';

type RequestListener = (req: PermissionRequest) => void;

export interface PermissionBus {
  ask: (req: PermissionRequest) => Promise<PromptChoice>;
  onRequest: (listener: RequestListener) => () => void;
  resolve: (choice: PromptChoice) => void;
}

export function createPermissionBus(): PermissionBus {
  let resolver: ((c: PromptChoice) => void) | null = null;
  const listeners = new Set<RequestListener>();

  return {
    ask: (req) =>
      new Promise<PromptChoice>((resolve) => {
        resolver = resolve;
        for (const l of listeners) l(req);
      }),
    onRequest: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resolve: (choice) => {
      resolver?.(choice);
      resolver = null;
    },
  };
}
