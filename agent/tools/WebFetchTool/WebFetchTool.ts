// agent/tools/WebFetchTool/WebFetchTool.ts
// Requete HTTP avec conversion HTML->texte simplifiee (doc 04).

import type { Tool, ToolResult } from '../../Tool';

const MAX_BYTES = 200_000;

/** Conversion HTML -> texte brut simplifiee (suppression des balises). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const WebFetchTool: Tool = {
  name: 'WebFetch',
  description: 'Fetch a URL and return its content as text.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch (http/https)' },
    },
    required: ['url'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = String(input.url ?? '');
    if (!/^https?:\/\//.test(url)) {
      return { content: 'Error: url must start with http:// or https://', isError: true };
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok) return { content: `Error: HTTP ${res.status}`, isError: true };
      const raw = (await res.text()).slice(0, MAX_BYTES);
      const isHtml = (res.headers.get('content-type') ?? '').includes('html');
      return { content: isHtml ? htmlToText(raw) : raw };
    } catch (error) {
      return { content: `Error fetching URL: ${error instanceof Error ? error.message : error}`, isError: true };
    }
  },
};
