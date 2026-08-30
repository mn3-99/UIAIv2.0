// agent/tools/AgentTool.ts
// AgentTool : creation de sous-agents (doc 11).

import type { Tool, ToolResult } from '../Tool';
import { spawnSubagent, type SubagentType } from '../multiagent/subagent';

export const AgentTool: Tool = {
  name: 'Agent',
  description:
    'Delegate a task to a sub-agent that runs in its own context and returns a result. Useful for parallel or isolated work.',
  risk: 'MEDIUM',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Short description of the sub-agent task' },
      prompt: { type: 'string', description: 'The task prompt for the sub-agent' },
      subagent_type: {
        type: 'string',
        enum: ['general-purpose', 'Explore', 'Plan', 'MijlAI-code-guide'],
        description: 'Type of sub-agent',
      },
      tools: { type: 'array', items: { type: 'string' }, description: 'Optional subset of tool names' },
    },
    required: ['description', 'prompt'],
  },
  async execute(input): Promise<ToolResult> {
    const type = (input.subagent_type as SubagentType) ?? 'general-purpose';
    const result = await spawnSubagent({
      prompt: String(input.prompt ?? ''),
      type,
      allowedTools: Array.isArray(input.tools) ? (input.tools as string[]) : undefined,
    });
    return { content: result };
  },
};
