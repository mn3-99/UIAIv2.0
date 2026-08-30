// agent/services/api.ts
// Client API vers les endpoints UIAI existants (docs 02/03 ; doc 12 l'etendra).
// Endpoint OpenAI-compatible du projet : POST /api/v1/chat/completions (SSE ok).

import { CHAT_COMPLETIONS_PATH } from '../constants/index';
import { ApiError, withRetry } from '../utils/retry';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Suivi de l'utilisation (doc 03 : Usage). */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason: string | null;
}

export interface ApiClientOptions {
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

export class ApiClient {
  constructor(private opts: ApiClientOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.opts.apiKey) h['authorization'] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  get model(): string {
    return this.opts.model;
  }

  /** Completion non-streaming avec retry (doc 03). */
  async chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<ChatResult> {
    return withRetry(async () => {
      const res = await fetch(`${this.opts.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          stream: false,
          ...(tools && tools.length > 0 ? { tools } : {}),
        }),
      });
      if (!res.ok) throw new ApiError(`API ${res.status}: ${await res.text().catch(() => res.statusText)}`, res.status);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string } | string;
      };
      if (data.error) {
        const msg = typeof data.error === 'string' ? data.error : data.error.message ?? 'erreur API';
        throw new ApiError(msg, res.status);
      }
      const choice = data.choices?.[0];
      return {
        text: choice?.message?.content ?? '',
        toolCalls: choice?.message?.tool_calls ?? [],
        usage: {
          input_tokens: data.usage?.prompt_tokens ?? 0,
          output_tokens: data.usage?.completion_tokens ?? 0,
        },
        finishReason: choice?.finish_reason ?? null,
      };
    });
  }

  /**
   * Completion streaming (SSE OpenAI) avec retry sur l'etablissement.
   * Les deltas sont pousses via onDelta au fil de l'arrivee (doc 03).
   */
  async chatStream(
    messages: ChatMessage[],
    tools: ToolSpec[] | undefined,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    const res = await withRetry(async () => {
      const r = await fetch(`${this.opts.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
        method: 'POST',
        headers: this.headers(),
        signal: signal ?? null,
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          stream: true,
          ...(tools && tools.length > 0 ? { tools } : {}),
        }),
      });
      if (!r.ok) throw new ApiError(`API ${r.status}: ${await r.text().catch(() => r.statusText)}`, r.status);
      if (!r.body) throw new ApiError('pas de flux SSE', null);
      return r;
    });

    // Accumulation du flux (doc 03 : accumulateStream)
    let text = '';
    const toolCalls = new Map<number, ToolCall>();
    let usage: Usage = { input_tokens: 0, output_tokens: 0 };
    let finishReason: string | null = null;

    const decoder = new TextDecoder();
    let buffer = '';
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const evt of events) {
        const dataLine = evt.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
              finish_reason?: string | null;
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            text += delta.content;
            onDelta(delta.content);
          }
          for (const tc of delta?.tool_calls ?? []) {
            const existing = toolCalls.get(tc.index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            toolCalls.set(tc.index, existing);
          }
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
          if (chunk.usage) {
            usage = { input_tokens: chunk.usage.prompt_tokens ?? 0, output_tokens: chunk.usage.completion_tokens ?? 0 };
          }
        } catch {
          // ligne SSE partielle -> ignoree (degradation gracieuse)
        }
      }
    }
    return { text, toolCalls: [...toolCalls.values()], usage, finishReason };
  }
}
