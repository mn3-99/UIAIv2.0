// agent/utils/security.ts
// Validation des inputs, fichiers proteges, detection/scrubbing de secrets (doc 15).

import { resolve as pathResolve, normalize, basename } from 'node:path';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** Prevention de traversal de chemin (doc 15 : validatePath). */
export function validatePath(inputPath: string): ValidationResult {
  if (/%2e/i.test(inputPath)) return { valid: false, reason: 'URL-encoded path traversal' };
  if (inputPath !== normalize(inputPath)) return { valid: false, reason: 'Unicode normalization mismatch' };
  if (inputPath.includes('..')) return { valid: false, reason: 'Parent directory traversal' };
  if (/\\\.\./.test(inputPath)) return { valid: false, reason: 'Backslash path traversal' };
  if (inputPath.includes('\0')) return { valid: false, reason: 'Null byte in path' };
  const resolved = pathResolve(inputPath);
  if (resolved.toLowerCase() !== pathResolve(inputPath).toLowerCase()) {
    return { valid: false, reason: 'Case manipulation detected' };
  }
  return { valid: true };
}

const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\/(?!\w)/,
  /mkfs\./,
  /dd\s+.*of=\/dev/,
  /:\(\)\s*{\s*:|:&\s*}/,
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777\s+\//,
];

/** Validation des commandes shell (doc 15 : validateCommand). */
export function validateCommand(command: string): ValidationResult {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, reason: 'Potentially dangerous command pattern detected' };
    }
  }
  return { valid: true };
}

export const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9]{20,}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE KEY/,
  /AIza[a-zA-Z0-9_-]{35}/,
  /AKIA[A-Z0-9]{16}/,
];

/** Detecte un secret dans un texte (doc 15). */
export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(text));
}

/** Masque les secrets (doc 15 : scrubSecrets). */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '<REDACTED>');
  }
  return out;
}

/**
 * Validation centralisee par outil (doc 15 : defense en profondeur, couche 3-4).
 * Retourne un message d'erreur ou null si tout va bien.
 */
export function securityValidate(toolName: string, input: Record<string, unknown>): string | null {
  if (toolName === 'Bash') {
    const cmd = String(input.command ?? input.cmd ?? '');
    const c = validateCommand(cmd);
    if (!c.valid) return `Refuse (securite): ${c.reason}`;
    if (containsSecret(cmd)) return 'Refuse (securite): commande contient un secret potentiel';
    return null;
  }
  // Outils fichiers : valide les champs path/file_path
  for (const key of ['path', 'file_path', 'filePath']) {
    const p = input[key];
    if (typeof p === 'string') {
      const v = validatePath(p);
      if (!v.valid) return `Refuse (securite): chemin '${p}' — ${v.reason}`;
    }
  }
  return null;
}

/** Verifie qu'un chemin reste dans un repertoire autorise (doc 15 : safePath). */
export function safePath(inputPath: string, allowedBase: string): string | null {
  const resolved = pathResolve(inputPath);
  if (!resolved.startsWith(pathResolve(allowedBase))) return null;
  if (basename(resolved).startsWith('.')) {
    const blocked = ['.env', '.ssh', '.git', 'credentials.json'];
    if (blocked.some((b) => basename(resolved) === b || basename(resolved).startsWith(b))) return null;
  }
  return resolved;
}
