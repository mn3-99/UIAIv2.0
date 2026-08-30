// agent/tools.ts
// Registre central des outils (doc 04) : chargement, filtrage par feature flags
// et permissions, cache des schemas.

import type { Tool } from './Tool';
import type { ToolSpec } from './services/api';
import { feature, type FeatureFlag } from './utils/feature';

import FileReadTool from './tools/FileReadTool';
import FileWriteTool from './tools/FileWriteTool';
import FileEditTool from './tools/FileEditTool';
import GlobTool from './tools/GlobTool';
import GrepTool from './tools/GrepTool';
import BashTool from './tools/BashTool';
import WebFetchTool from './tools/WebFetchTool';
import { TaskCreateTool, TaskGetTool, TaskListTool, TaskUpdateTool } from './tools/TaskTools';
import { AskUserQuestionTool, ToolSearchTool, bindToolSearchSource } from './tools/MiscTools';
import { AgentTool } from './tools/AgentTool';
import { TeamCreateTool, TeamDeleteTool, SendMessageTool, TeamListTool } from './tools/TeamTools';
import { EnterWorktreeTool, ExitWorktreeTool } from './tools/WorktreeTools';
import { CoordinatorTool } from './multiagent/coordinator';

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private schemaCache = new Map<string, ToolSpec>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return [...this.tools.values()];
  }

  /** Cache des schemas (doc 04 : evite la re-serialisation a chaque appel). */
  getSpec(tool: Tool): ToolSpec {
    const cached = this.schemaCache.get(tool.name);
    if (cached) return cached;
    const spec: ToolSpec = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
      },
    };
    this.schemaCache.set(tool.name, spec);
    return spec;
  }

  getSpecs(): ToolSpec[] {
    return this.getAll().map((t) => this.getSpec(t));
  }
}

let registry: ToolRegistry | null = null;

/** Tous les outils connus (doc 04 : catalogue). */
function allTools(): Tool[] {
  return [
    FileReadTool,
    FileWriteTool,
    FileEditTool,
    GlobTool,
    GrepTool,
    BashTool,
    WebFetchTool,
    TaskCreateTool,
    TaskGetTool,
    TaskListTool,
    TaskUpdateTool,
    ToolSearchTool,
    AskUserQuestionTool,
    AgentTool,
    TeamCreateTool,
    TeamDeleteTool,
    SendMessageTool,
    TeamListTool,
    EnterWorktreeTool,
    ExitWorktreeTool,
    CoordinatorTool,
  ];
}

/**
 * Chargement et filtrage du registre (doc 04) :
 * - feature flags (tool.featureGate)
 * - internalOnly filtre pour l'usage standard
 */
export async function getToolRegistry(): Promise<ToolRegistry> {
  if (registry) return registry;
  registry = new ToolRegistry();
  for (const tool of allTools()) {
    if (tool.internalOnly) continue;
    if (tool.featureGate && !feature(tool.featureGate as FeatureFlag)) continue;
    registry.register(tool);
  }
  // Injection pour ToolSearchTool (evite le cycle d'import)
  bindToolSearchSource(() => registry!.getAll().map((t) => ({ name: t.name, description: t.description })));
  return registry;
}

export function resetToolRegistry(): void {
  registry = null;
}
