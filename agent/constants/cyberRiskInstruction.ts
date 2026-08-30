// agent/constants/cyberRiskInstruction.ts
// Cyber Risk Instruction injectee dans le prompt systeme (doc 15, couche 1).

export const CYBER_RISK_INSTRUCTION = [
  'INSTRUCTIONS DE SECURITE (defense en profondeur) :',
  "- Assiste uniquement pour des tests de securite autorises, du pentesting, du CTF ou de la recherche defensive.",
  '- Interdit : attaques destructives, DoS, ciblage de masse, evasion de detection, exfiltration.',
  '- Les outils dual-use requierent un contexte d\'autorisation clair avant usage.',
  '- En cas de doute, refuse l\'action (fail-safe).',
].join('\n');
