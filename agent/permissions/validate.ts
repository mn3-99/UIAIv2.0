// agent/permissions/validate.ts
// Validation des inputs (doc 08) : traversal de chemin + commandes shell dangereuses.

/** Prevention de traversal de chemin (doc 08). */
export function hasPathTraversal(path: string): boolean {
  if (path.includes('%2e') || path.includes('%2E')) return true; // URL-encoded
  if (path !== path.normalize('NFC')) return true; // Unicode normalization
  if (/\.\./.test(path)) return true; // double dots
  if (/\\\.{1,2}/.test(path)) return true; // backslash injection (Windows)
  return false;
}

export type ValidationResult = { valid: boolean; reason?: string };

const DANGEROUS_BASH: RegExp[] = [
  /rm\s+-rf\s+\//, // rm -rf /
  /\brm\s+-rf\b(?!\s*\.?\w)/, // rm -rf sur repertoire large
  /mkfs/, // formatage disque
  /dd\s+if=.*of=\/dev/, // destruction disque
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  /chmod\s+-R\s+777\s+\//, // chmod 777 racine
  />\s*\/dev\/sd[a-z]/, // ecriture brute disque
  /\bcurl\b.*\|\s*(sudo\s+)?(ba)?sh\b/, // pipe vers shell depuis le reseau
  /\bwget\b.*\|\s*(ba)?sh\b/,
];

/** Validation des commandes shell (doc 08). */
export function validateBashCommand(command: string): ValidationResult {
  for (const pattern of DANGEROUS_BASH) {
    if (pattern.test(command)) {
      return { valid: false, reason: 'Commande dangereuse detectee — operation refusee' };
    }
  }
  return { valid: true };
}
