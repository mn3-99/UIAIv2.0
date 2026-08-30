// agent/tools/MiscTools/index.ts
// ToolSearchTool + AskUserQuestionTool (doc 04).

import type { Tool, ToolResult } from '../../Tool';

let searchSource: () => Array<{ name: string; description: string }> = () => [];

/** Injection tardive du registre pour eviter les cycles d'import. */
export function bindToolSearchSource(fn: () => Array<{ name: string; description: string }>): void {
  searchSource = fn;
}

export const ToolSearchTool: Tool = {
  name: 'ToolSearch',
  description: 'Discover available tools by keyword.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Keyword to search tools' } },
    required: ['query'],
  },
  async execute(input): Promise<ToolResult> {
    const q = String(input.query ?? '').toLowerCase();
    const matches = searchSource().filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
    return { content: matches.length > 0 ? matches.map((t) => `${t.name}: ${t.description}`).join('\n') : '(aucun outil trouve)' };
  },
};

export const AskUserQuestionTool: Tool = {
  name: 'AskUserQuestion',
  description: 'Ask the user a question and return their answer.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: { question: { type: 'string', description: 'Question to ask the user' } },
    required: ['question'],
  },
  async execute(input, context): Promise<ToolResult> {
    if (!context.askUser) {
      return { content: 'Error: pas de canal interactif disponible', isError: true };
    }
    const answer = await context.askUser(String(input.question ?? ''));
    return { content: answer };
  },
};
