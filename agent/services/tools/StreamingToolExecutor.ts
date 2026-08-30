// agent/services/tools/StreamingToolExecutor.ts
// Executeur principal (doc 04) : parse tool_use -> registre -> permissions ->
// execution (parallele possible) -> resultat formate pour l'API.

import type { ToolUseContext, ToolResult } from '../../Tool';
import type { ToolCall } from '../api';
import type { ToolRegistry } from '../../tools';
import type { PermissionDecision } from '../../QueryEngine';
import { preExecute, postExecute } from './toolHooks';

export type PermissionFn = (call: ToolCall) => Promise<PermissionDecision>;

export interface ExecutedCall {
  call: ToolCall;
  result: ToolResult;
  durationMs: number;
}

/** Execute un appel avec verification de permission (doc 04). */
export async function executeWithPermission(
  registry: ToolRegistry,
  call: ToolCall,
  context: ToolUseContext,
  checkPermission: PermissionFn,
): Promise<ExecutedCall> {
  const start = Date.now();
  const tool = registry.get(call.function.name);
  if (!tool) {
    return { call, result: { content: `Unknown tool: ${call.function.name}`, isError: true }, durationMs: 0 };
  }

  const permission = await checkPermission(call);
  if (permission !== 'approved') {
    const content = permission === 'denied'
      ? 'Permission denied by user'
      : 'Permission requires user approval (non disponible) — refuse.';
    return { call, result: { content, isError: true }, durationMs: Date.now() - start };
  }

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
  } catch {
    return { call, result: { content: `Error: invalid JSON arguments for ${tool.name}`, isError: true }, durationMs: Date.now() - start };
  }

  // Hooks pre-execution
  const validationError = await preExecute(tool, input, context?.sessionId);
  if (validationError) {
    return { call, result: { content: validationError, isError: true }, durationMs: Date.now() - start };
  }

  // Execution
  try {
    const raw = await tool.execute(input, context);
    const result: ToolResult = typeof raw === 'string' ? { content: raw } : raw;
    const durationMs = Date.now() - start;
    result.content = postExecute(tool, result.content, result.isError ?? false, durationMs, context?.sessionId);
    return { call, result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    const content = postExecute(tool, `Tool error: ${error instanceof Error ? error.message : error}`, true, durationMs, context?.sessionId);
    return { call, result: { content, isError: true }, durationMs };
  }
}

/** Execution parallele des appels independants (doc 04). */
export async function executeAll(
  registry: ToolRegistry,
  calls: ToolCall[],
  context: ToolUseContext,
  checkPermission: PermissionFn,
): Promise<ExecutedCall[]> {
  return Promise.all(calls.map((call) => executeWithPermission(registry, call, context, checkPermission)));
}
