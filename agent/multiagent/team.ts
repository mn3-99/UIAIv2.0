// agent/multiagent/team.ts
// Bus de messagerie inter-agents (doc 11 : TeamCreate/Delete/SendMessage).

export interface TeamMessage {
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

interface Team {
  id: string;
  name: string;
  members: string[];
  inbox: Map<string, TeamMessage[]>;
}

const teams = new Map<string, Team>();

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cree une equipe (doc 11 : TeamCreateTool). */
export function createTeam(name: string, members: string[] = []): Team {
  const id = genId('team');
  const team: Team = { id, name, members: [...members, 'coordinator'], inbox: new Map() };
  teams.set(id, team);
  return team;
}

/** Supprime une equipe (doc 11 : TeamDeleteTool). */
export function deleteTeam(id: string): boolean {
  return teams.delete(id);
}

/** Envoie un message a un membre (ou broadcast si to='*'). */
export function sendMessage(teamId: string, from: string, to: string, content: string): boolean {
  const team = teams.get(teamId);
  if (!team) return false;
  const targets = to === '*' ? team.members : [to];
  for (const t of targets) {
    if (!team.inbox.has(t)) team.inbox.set(t, []);
    team.inbox.get(t)!.push({ from, to: t, content, timestamp: Date.now() });
  }
  return true;
}

/** Receptionne et consomme les messages d'un agent. */
export function receiveMessages(agentId: string): TeamMessage[] {
  const out: TeamMessage[] = [];
  for (const team of teams.values()) {
    const box = team.inbox.get(agentId);
    if (box && box.length) {
      out.push(...box.splice(0, box.length));
    }
  }
  return out;
}

export function listTeams(): Team[] {
  return [...teams.values()];
}

export function getTeam(id: string): Team | undefined {
  return teams.get(id);
}
