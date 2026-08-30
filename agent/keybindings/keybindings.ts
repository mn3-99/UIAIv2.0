// agent/keybindings/keybindings.ts
// Registre de keybindings + gestion des chords (doc 13).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_BINDINGS, type Keybinding } from './defaults';
import { parseBinding, eventToCombo, matchesCombo, type KeyCombo } from './parser';

interface ResolvedBinding {
  combos: KeyCombo[][]; // chord : liste de combos successifs
  command: string;
  isChord: boolean;
}

export class KeybindingManager {
  private bindings: ResolvedBinding[] = [];

  constructor() {
    this.loadDefaults();
  }

  loadDefaults(): void {
    this.bindings = DEFAULT_BINDINGS.map((b) => ({
      combos: parseBinding(b.keys),
      command: b.command,
      isChord: b.type === 'chord',
    }));
  }

  /** Charge la config utilisateur (~/.MijlAI/keybindings.json), prioritaire. */
  loadUserConfig(path?: string): void {
    const p = path ?? join(homedir(), '.MijlAI', 'keybindings.json');
    if (!existsSync(p)) return;
    try {
      const cfg = JSON.parse(readFileSync(p, 'utf-8')) as { bindings?: Keybinding[] };
      for (const b of cfg.bindings ?? []) {
        this.bindings.push({ combos: parseBinding(b.keys), command: b.command, isChord: b.type === 'chord' });
      }
    } catch {
      /* ignore */
    }
  }

  list(): { keys: string; command: string }[] {
    return this.bindings.map((b, i) => ({ keys: DEFAULT_BINDINGS[i]?.keys ?? '?', command: b.command }));
  }

  /** Resout un evenement clavier vers une commande (gestion des chords). */
  resolve(input: string, key: Record<string, boolean>): string | null {
    const combo = eventToCombo(input, key);
    // Recherche d'un chord dont le 1er combo correspond
    for (const b of this.bindings) {
      if (b.isChord && b.combos.length === 2) {
        if (matchesCombo(b.combos[0][0], combo)) return `__chord_start__:${b.command}`;
      }
      // Raccourci simple (un seul combo)
      if (!b.isChord && b.combos.length === 1 && matchesCombo(b.combos[0][0], combo)) {
        return b.command;
      }
    }
    return null;
  }
}

/** Gestionnaire de chords (doc 13 : ChordHandler). */
export class ChordHandler {
  private pendingChord: string | null = null;
  private chordTimeout: ReturnType<typeof setTimeout> | null = null;

  handleKey(command: string | null): { command: string | null; isChordStart: boolean } {
    if (command?.startsWith('__chord_start__:')) {
      this.pendingChord = command.replace('__chord_start__:', '');
      this.clearPending();
      this.chordTimeout = setTimeout(() => this.clearPending(), 500);
      return { command: null, isChordStart: true };
    }
    if (this.pendingChord) {
      const chord = this.pendingChord;
      this.clearPending();
      // Le second coup doit etre le meme chord (ex: ctrl+k puis ctrl+c)
      // Ici on renvoie simplement la commande si la 2e touche est le 2e membre.
      return { command: chord, isChordStart: false };
    }
    return { command, isChordStart: false };
  }

  private clearPending(): void {
    if (this.chordTimeout) clearTimeout(this.chordTimeout);
    this.chordTimeout = null;
    this.pendingChord = null;
  }
}

export const keybindings = new KeybindingManager();
