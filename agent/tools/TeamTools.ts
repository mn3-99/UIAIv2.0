// agent/tools/TeamTools.ts
// Outils d'equipe : TeamCreate / TeamDelete / SendMessage (doc 11).

import type { Tool, ToolResult } from '../Tool';
import { createTeam, deleteTeam, sendMessage, listTeams } from '../multiagent/team';

export const TeamCreateTool: Tool = {
  name: 'TeamCreate',
  description: 'Create a team of agents for inter-agent messaging.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Team name' },
      members: { type: 'array', items: { type: 'string' }, description: 'Member agent ids' },
    },
    required: ['name'],
  },
  async execute(input): Promise<ToolResult> {
    const team = createTeam(String(input.name ?? 'team'), Array.isArray(input.members) ? (input.members as string[]) : []);
    return { content: `Equipe creee: ${team.id} (${team.members.join(', ')})` };
  },
};

export const TeamDeleteTool: Tool = {
  name: 'TeamDelete',
  description: 'Delete a team by id.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: { teamId: { type: 'string', description: 'Team id' } },
    required: ['teamId'],
  },
  async execute(input): Promise<ToolResult> {
    const ok = deleteTeam(String(input.teamId ?? ''));
    return ok ? { content: `Equipe ${input.teamId} supprimee` } : { content: `Equipe ${input.teamId} introuvable`, isError: true };
  },
};

export const SendMessageTool: Tool = {
  name: 'SendMessage',
  description: 'Send a message to a team member (or broadcast with to="*").',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      teamId: { type: 'string', description: 'Team id' },
      from: { type: 'string', description: 'Sender agent id' },
      to: { type: 'string', description: 'Recipient agent id or "*" for broadcast' },
      content: { type: 'string', description: 'Message content' },
    },
    required: ['teamId', 'from', 'to', 'content'],
  },
  async execute(input): Promise<ToolResult> {
    const ok = sendMessage(String(input.teamId ?? ''), String(input.from ?? 'agent'), String(input.to ?? '*'), String(input.content ?? ''));
    return ok ? { content: 'Message envoye' } : { content: `Equipe ${input.teamId} introuvable`, isError: true };
  },
};

export const TeamListTool: Tool = {
  name: 'TeamList',
  description: 'List all active teams.',
  risk: 'LOW',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    const teams = listTeams();
    if (teams.length === 0) return { content: '(aucune equipe)' };
    return { content: teams.map((t) => `${t.id} [${t.name}] membres: ${t.members.join(', ')}`).join('\n') };
  },
};
