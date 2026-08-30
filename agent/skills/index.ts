// agent/skills/index.ts
// Systeme de skills (doc 05) : commandes enrichies avec prompt injecte.

export interface Skill {
  name: string;
  trigger: string;
  prompt: string;
  tools?: string[];
}

/** Skills integres (doc 05). */
export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'simplify',
    trigger: '/simplify',
    prompt: 'Simplifie le code cible: reduis la complexite, supprime la duplication, garde le comportement.',
  },
  {
    name: 'review-pr',
    trigger: '/review-pr',
    prompt: 'Fais une revue de PR structuree: resume, risques, tests manquants, verdict.',
  },
  {
    name: 'commit',
    trigger: '/commit',
    prompt: 'Workflow de commit: analyse le diff et propose un message de commit conventionnel.',
  },
  {
    name: 'uiai-api',
    trigger: '/uiai-api',
    prompt: 'Aide a l\'utilisation des endpoints UIAI (/api/v1/chat/completions, /api/models, /api/search...).',
  },
  {
    name: 'keybindings-help',
    trigger: '/keybindings-help',
    prompt: 'Explique les raccourcis clavier disponibles dans le terminal (doc 13).',
  },
  {
    name: 'update-config',
    trigger: '/update-config',
    prompt: 'Aide a modifier la configuration de l\'agent (~/.uiai-agent/config.json).',
  },
];

export function getSkill(name: string): Skill | undefined {
  return BUILTIN_SKILLS.find((s) => s.name === name);
}

export function listSkills(): Skill[] {
  return [...BUILTIN_SKILLS];
}
