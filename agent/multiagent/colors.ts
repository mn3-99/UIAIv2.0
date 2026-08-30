// agent/multiagent/colors.ts
// Couleurs d'identification des agents (doc 11).

export const AGENT_COLORS = [
  'cyan',
  'magenta',
  'yellow',
  'green',
  'blue',
  'red',
  'white',
] as const;

export type AgentColor = (typeof AGENT_COLORS)[number];

/** Attribue une couleur distincte par index d'agent. */
export function assignColor(agentIndex: number): AgentColor {
  return AGENT_COLORS[agentIndex % AGENT_COLORS.length];
}
