// agent/permissions/PermissionSystem.ts
// Systeme de permissions central (doc 08) : classification, modes, fichiers
// proteges, cache de session, dialogue utilisateur.

import type { ToolRegistry } from '../tools';
import type { ToolCall } from '../services/api';
import { isProtectedTarget, matchGlob } from './protectedFiles';
import { hasPathTraversal, validateBashCommand } from './validate';
import { classify } from './classifier';

export type PermissionMode = 'default' | 'auto' | 'bypass';
export type PermissionDecision = 'approved' | 'denied' | 'ask_user';
export type PromptChoice = 'approve' | 'approve_session' | 'deny';

export interface PermissionRequest {
  tool: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  argString: string;
  reason?: string;
}

export type PromptHandler = (req: PermissionRequest) => Promise<PromptChoice>;

export interface PermissionSystemOptions {
  mode: PermissionMode;
  registry: ToolRegistry;
  /** Dialogue interactif (fourni par le mode TTY/non-TTY). */
  promptHandler?: PromptHandler;
}

interface CacheEntry {
  decision: 'allow' | 'deny';
  session: boolean;
}

export class PermissionSystem {
  private mode: PermissionMode;
  private registry: ToolRegistry;
  private promptHandler?: PromptHandler;
  private cache = new Map<string, CacheEntry>();

  constructor(opts: PermissionSystemOptions) {
    this.mode = opts.mode;
    this.registry = opts.registry;
    this.promptHandler = opts.promptHandler;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  /** Classification du risque a partir du registre d'outils. */
  private riskOf(toolName: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    return this.registry.get(toolName)?.risk ?? 'HIGH';
  }

  private cacheKey(tool: string, argString: string): string {
    return `${tool}::${argString}`;
  }

  /** Verifie les cibles protegees/fentes (defense en profondeur). */
  private preValidate(tool: string, parsed: Record<string, unknown>): string | null {
    if (tool === 'FileWrite' || tool === 'FileEdit') {
      const path = String(parsed['file_path'] ?? '');
      if (hasPathTraversal(path)) return 'Traversal de chemin detecte';
      if (isProtectedTarget(path)) return `Fichier protege: ${path}`;
    }
    if (tool === 'Bash') {
      const command = String(parsed['command'] ?? '');
      const v = validateBashCommand(command);
      if (!v.valid) return v.reason ?? 'Commande refusee';
    }
    return null;
  }

  /** Point d'entree utilise par le QueryEngine (doc 08 + doc 03). */
  async decide(call: ToolCall): Promise<PermissionDecision> {
    const tool = call.function.name;
    const risk = this.riskOf(tool);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(call.function.arguments || '{}');
    } catch {
      /* ignore */
    }
    const argString = call.function.arguments || '';

    // 1. Fichiers proteges -> DENY auto
    const block = this.preValidate(tool, parsed);
    if (block) return 'denied';

    // 2. LOW -> auto-approuve
    if (risk === 'LOW' || this.mode === 'bypass') return 'approved';

    // 3. Cache de session
    const key = this.cacheKey(tool, argString);
    const cached = this.cache.get(key);
    if (cached) return cached.decision === 'allow' ? 'approved' : 'denied';

    // 4. Mode auto -> classificateur
    if (this.mode === 'auto') {
      const out = classify({ tool, risk, argString });
      if (out.decision === 'approve') return 'approved';
      if (out.decision === 'deny') return 'denied';
      // ask_user -> tombe dans le prompt ci-dessous
    }

    // 5. Mode default ou incertain -> demander a l'utilisateur
    if (!this.promptHandler) return 'ask_user';
    const choice = await this.promptHandler({
      tool,
      risk,
      argString,
      reason:
        risk === 'HIGH'
          ? `Outil a haut risque (${tool}) — ${argString.slice(0, 120)}`
          : undefined,
    });
    if (choice === 'deny') {
      this.cache.set(key, { decision: 'deny', session: false });
      return 'denied';
    }
    if (choice === 'approve_session') {
      this.cache.set(key, { decision: 'allow', session: true });
      // autorise aussi l'outil pour la session
      this.cache.set(`${tool}::`, { decision: 'allow', session: true });
      return 'approved';
    }
    return 'approved';
  }

  /** Autorise un outil pour toute la session (doc 08 : grant). */
  allowToolForSession(tool: string): void {
    this.cache.set(`${tool}::`, { decision: 'allow', session: true });
  }

  /** Refuse un outil pour la session. */
  denyToolForSession(tool: string): void {
    this.cache.set(`${tool}::`, { decision: 'deny', session: true });
  }

  /** Pattern allow (doc 08 : patternLevel). */
  allowPattern(pattern: string): void {
    this.cache.set(`pattern:${pattern}`, { decision: 'allow', session: true });
  }

  isPatternAllowed(pattern: string): boolean {
    return this.cache.get(`pattern:${pattern}`)?.decision === 'allow';
  }
}

/** Match approximatif d'un pattern autorise (ex: FileWrite:/src/*). */
export function matchPermissionPattern(tool: string, path: string, allowed: string[]): boolean {
  return allowed.some((a) => {
    const [t, p] = a.split(':');
    return t === tool && p !== undefined && matchGlob(path, p);
  });
}
