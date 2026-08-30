// agent/services/autoDream/consolidationPrompt.ts
// Prompt de consolidation (doc 09 : Phase CONSOLIDATE).

export const ORIENT_PROMPT = `Tu es le systeme de memoire "autoDream".
Lis l'index MEMORY.md existant et dis, pour chaque sujet nouveau des journaux,
s'il correspond a une memoire existante (a mettre a jour) ou s'il est nouveau.`;

export const CONSOLIDATE_PROMPT = (dailyLogs: string, memoryContext: string): string => `Consolide les memoires a partir des journaux quotidiens.

## Index MEMORY.md actuel
${memoryContext || '(vide)'}

## Journaux recents
${dailyLogs.slice(0, 8000)}

Produis un JSON: {
  "updates": [ { "name": string, "description": string, "type": "user"|"feedback"|"project"|"reference", "content": string } ],
  "creates": [ { "name": string, "description": string, "type": ..., "content": string } ],
  "prune": [ "nom a supprimer" ]
}
Regles: fusionne les infos redondantes, garde chaque memoire concise (< 150 mots).`;

export const PRUNE_NOTE = 'L\'index MEMORY.md doit rester < 200 lignes.';
