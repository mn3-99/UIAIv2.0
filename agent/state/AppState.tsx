// agent/state/AppState.tsx
// React Context Provider + hook useAppState (doc 07 : integration React).

import React, { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { Store } from './AppStateStore';
import type { AppState } from './types';

export type { AppState } from './types';
export { initialAppState } from './types';

const StoreContext = createContext<Store<AppState> | null>(null);

export function AppStateProvider({ store, children }: { store: Store<AppState>; children: ReactNode }): React.JSX.Element {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store<AppState> {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore doit etre utilise sous <AppStateProvider>');
  return store;
}

/** Abonne un composant a l'etat complet (doc 07). */
export function useAppState(): Readonly<AppState> {
  const store = useStore();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );
}

/** Selecteur : abonne a une sous-partie de l'etat (doc 07 : selecteurs). */
export function useAppSelector<T>(selector: (state: Readonly<AppState>) => T): T {
  const state = useAppState();
  return selector(state);
}
