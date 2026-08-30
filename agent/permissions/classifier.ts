// agent/permissions/classifier.ts
// Classificateur "YOLO" (mode auto) — heuristique par regles (doc 08).
// Sans modele ML dedie, on evalue risque/recommandation via patterns.

export type ClassifierDecision = 'approve' | 'deny' | 'ask_user';

export interface ClassifierInput {
  tool: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  argString: string;
}

export interface ClassifierOutput {
  decision: ClassifierDecision;
  confidence: number;
  reasoning: string;
}

const READ_ONLY_BASH = [
  /git\s+status/,
  /git\s+log/,
  /git\s+diff/,
  /git\s+branch/,
  /git\s+show/,
  /ls\b/,
  /cat\s/,
  /echo\s/,
  /pwd/,
  /which\s/,
  /npm\s+list/,
  /npm\s+ls/,
];

const DESTRUCTIVE_BASH = [
  /\brm\b/,
  /\bmv\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset/,
  /\bgit\s+checkout\b/,
  /\bnpm\s+install\b/,
  /\bnpm\s+run\b/,
  /\bpip\s+install\b/,
  /\bsudo\b/,
];

export function classify(input: ClassifierInput): ClassifierOutput {
  const cmd = input.argString.toLowerCase();

  if (input.risk === 'LOW') {
    return { decision: 'approve', confidence: 0.98, reasoning: 'Outil lecture seule, sans effet de bord.' };
  }

  if (input.risk === 'MEDIUM') {
    // Lecture/ecriture de fichiers : generalement sur
    return { decision: 'approve', confidence: 0.82, reasoning: 'Modification de fichier ciblee, effet de bord local.' };
  }

  // HIGH (Bash surtout)
  if (READ_ONLY_BASH.some((re) => re.test(cmd))) {
    return { decision: 'approve', confidence: 0.94, reasoning: 'Commande shell lecture seule, aucun effet de bord.' };
  }
  if (DESTRUCTIVE_BASH.some((re) => re.test(cmd))) {
    return { decision: 'ask_user', confidence: 0.85, reasoning: 'Commande a effet de bord potentiel — confirmation recommandee.' };
  }
  return { decision: 'ask_user', confidence: 0.6, reasoning: 'Action shell non triviale — verification humaine.' };
}
