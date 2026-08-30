// agent/commands/gated.ts
// Commandes conditionnelles par feature flags (doc 05).

import type { Command } from '../commands';

export const bridgeCommand: Command = {
  name: 'bridge',
  description: 'Controle distant via bridge WebSocket (doc 10)',
  featureGate: 'BRIDGE',
  run: () => 'Pour lancer le bridge: UIAI_AGENT_BRIDGE=1 npm run agent (doc 10).',
};

export const voiceCommand: Command = {
  name: 'voice',
  description: 'Entree vocale (non implementee)',
  featureGate: 'VOICE_MODE',
  run: () => 'Le mode voix n\'est pas implemente dans cette version.',
};

export const proactiveCommand: Command = {
  name: 'proactive',
  description: 'Assistant toujours actif (KAIROS)',
  featureGate: 'KAIROS',
  run: () => 'Le mode proactif KAIROS n\'est pas actif.',
};
