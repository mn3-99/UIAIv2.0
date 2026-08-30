// agent/cost-tracker.ts
// Suivi des couts (doc 01 ; doc 03 : accumulation ; doc 12 : metriques detaillees).

import type { Usage } from './services/api';
import { calculateCost } from './utils/modelCost';

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  requests: number;
  // Durees (ms)
  totalDuration: number;
  toolExecutionDuration: number;
  // Fichiers
  linesAdded: number;
  linesRemoved: number;
}

let sessionUsage: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  requests: 0,
  totalDuration: 0,
  toolExecutionDuration: 0,
  linesAdded: 0,
  linesRemoved: 0,
};

export function trackUsage(usage: Usage): void {
  sessionUsage.inputTokens += usage.input_tokens || 0;
  sessionUsage.outputTokens += usage.output_tokens || 0;
  sessionUsage.cacheCreationTokens += (usage as unknown as { cache_creation_input_tokens?: number }).cache_creation_input_tokens || 0;
  sessionUsage.cacheReadTokens += (usage as unknown as { cache_read_input_tokens?: number }).cache_read_input_tokens || 0;
  sessionUsage.requests += 1;
}

export function trackDuration(ms: number): void {
  sessionUsage.totalDuration += ms;
}

export function trackToolDuration(ms: number): void {
  sessionUsage.toolExecutionDuration += ms;
}

export function trackFileEdits(added: number, removed: number): void {
  sessionUsage.linesAdded += added;
  sessionUsage.linesRemoved += removed;
}

export function getSessionUsage(): SessionUsage {
  return { ...sessionUsage };
}

export function resetUsage(): void {
  sessionUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    requests: 0,
    totalDuration: 0,
    toolExecutionDuration: 0,
    linesAdded: 0,
    linesRemoved: 0,
  };
}

/** Resume de session formate (doc 12 : costHook). */
export function getSessionSummary(model: string): string {
  const u = getSessionUsage();
  const cost = calculateCost(
    {
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      cache_creation_input_tokens: u.cacheCreationTokens,
      cache_read_input_tokens: u.cacheReadTokens,
    },
    model,
  );
  const mins = Math.floor(u.totalDuration / 60000);
  const secs = Math.floor((u.totalDuration % 60000) / 1000);
  return [
    'Session Summary:',
    `  Model: ${model}`,
    `  Duration: ${mins}m ${secs}s`,
    `  Input tokens: ${u.inputTokens.toLocaleString()}`,
    `  Output tokens: ${u.outputTokens.toLocaleString()}`,
    `  Cache reads: ${u.cacheReadTokens.toLocaleString()}`,
    `  Cache creation: ${u.cacheCreationTokens.toLocaleString()}`,
    `  Tool time: ${(u.toolExecutionDuration / 1000).toFixed(1)}s`,
    `  Total cost: $${cost.toFixed(4)}`,
  ].join('\n');
}

/** Resume compact (utilise par /session). */
export function formatUsage(): string {
  const u = getSessionUsage();
  return `requetes=${u.requests} tokens_in=${u.inputTokens} tokens_out=${u.outputTokens} cache_in=${u.cacheReadTokens} cout=$${calculateCost(
    {
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      cache_creation_input_tokens: u.cacheCreationTokens,
      cache_read_input_tokens: u.cacheReadTokens,
    },
    'mijlai-pwr',
  ).toFixed(4)}`;
}
