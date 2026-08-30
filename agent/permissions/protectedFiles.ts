// agent/permissions/protectedFiles.ts
// Fichiers proteges contre l'edition (doc 08).

export const PROTECTED_FILES: string[] = [
  '.gitconfig',
  '.bashrc',
  '.zshrc',
  '.bash_profile',
  '.bash_login',
  '.zprofile',
  '.profile',
  '.mcp.json',
  '.MijlAI.json',
  '.ssh/*',
  'credentials.json',
  '.env',
  '.env.*',
  'id_rsa',
  'id_ed25519',
];

function fileBase(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Correspondance glob simple (doc 08 : matchGlob). */
export function matchGlob(path: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    return path.startsWith(pattern.slice(0, -1));
  }
  if (pattern.includes('*')) {
    const base = fileBase(path);
    const p = fileBase(pattern);
    const prefix = p.split('*')[0];
    const suffix = p.split('*')[1] ?? '';
    return base.startsWith(prefix) && (suffix === '' || base.endsWith(suffix));
  }
  return path === pattern || fileBase(path) === pattern;
}

/** Vrai si le chemin cible un fichier protege. */
export function isProtectedTarget(path: string): boolean {
  return PROTECTED_FILES.some((p) => matchGlob(path, p));
}
