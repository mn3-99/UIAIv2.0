// agent/state/AppStateStore.ts
// Store centralise (doc 07) : immutable, versionne, avec listeners (Observer).

export type Listener<T> = (state: T, version: number) => void;

export interface Store<T> {
  getState: () => Readonly<T>;
  setState: (updater: (prev: Readonly<T>) => Partial<T>) => void;
  subscribe: (listener: Listener<T>) => () => void;
  getVersion: () => number;
}

/** Fabrique de store generique (doc 07 : Store minimal). */
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  let version = 0;
  const listeners = new Set<Listener<T>>();

  return {
    getState: () => state,
    setState: (updater) => {
      const updates = updater(state);
      state = { ...state, ...updates };
      version++;
      for (const listener of listeners) listener(state, version);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion: () => version,
  };
}
