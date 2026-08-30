// agent/multiagent/coordinator.ts
// Mode Coordinateur (doc 11) : orchestration en 4 phases.

import { spawnSubagent, type SubagentType } from './subagent';
import { writeScratch } from './scratchpad';
import type { Tool } from '../Tool';

export type CoordinatorPhase = 'Research' | 'Synthesis' | 'Implementation' | 'Verification';

interface WorkerSpec {
  prompt: string;
  type?: SubagentType;
  worktree?: boolean;
}

/**
 * Coordinateur : l'agent principal devient chef d'orchestre et delegue aux
 * workers (doc 11). Phases : Research -> Synthesis -> Implementation -> Verification.
 */
export class Coordinator {
  private workers = new Map<string, string>();
  private log: (msg: string) => void;

  constructor(log: (msg: string) => void = () => {}) {
    this.log = log;
  }

  private async spawnWorker(id: string, spec: WorkerSpec): Promise<string> {
    this.log(`[coordinator] spawn ${id} (${spec.type ?? 'general'})`);
    const colorIndex = this.workers.size;
    this.workers.set(id, spec.type ?? 'general-purpose');
    const result = await spawnSubagent({
      prompt: spec.prompt,
      type: spec.type ?? 'general-purpose',
      colorIndex,
    });
    this.log(`[coordinator] ${id} termine`);
    return result;
  }

  /** Orchestration complete d'une tache. */
  async orchestrate(task: string): Promise<string> {
    // Phase 1 : Research (parallele)
    this.log('[coordinator] Phase Research');
    const research = await Promise.all([
      this.spawnWorker('research-1', { prompt: `Analyse la tache suivante et trouve le code pertinent : ${task}`, type: 'Explore' }),
      this.spawnWorker('research-2', { prompt: `Identifie les fichiers et modules lies a : ${task}`, type: 'Explore' }),
    ]);
    await writeScratch('research', { findings: research.join('\n---\n') });

    // Phase 2 : Synthesis
    this.log('[coordinator] Phase Synthesis');
    const plan = await this.spawnWorker('synthesis', {
      prompt: `A partir de ces recherches, redige un plan d'implementation atomique pour : ${task}\n\nRecherches:\n${research.join('\n')}`,
      type: 'Plan',
    });
    await writeScratch('plan', { findings: plan });

    // Phase 3 : Implementation (parallele, worktrees isoles)
    this.log('[coordinator] Phase Implementation');
    const planSteps = plan
      .split(/\n\d+\.|\n-/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 4);
    const impl = await Promise.all(
      planSteps.map((step, i) =>
        this.spawnWorker(`impl-${i}`, { prompt: `Realise cette etape: ${step}`, type: 'general-purpose', worktree: true }),
      ),
    );

    // Phase 4 : Verification
    this.log('[coordinator] Phase Verification');
    const verify = await this.spawnWorker('verify', {
      prompt: `Verifie les changements suivants et signale les regressions :\n${impl.join('\n')}`,
      type: 'general-purpose',
    });

    return `# Rapport Coordinateur\n\n## Recherche\n${research.join('\n')}\n\n## Plan\n${plan}\n\n## Implementation\n${impl.join('\n')}\n\n## Verification\n${verify}`;
  }
}

/** Outil declenchant le mode coordinateur (doc 11). */
export const CoordinatorTool: Tool = {
  name: 'Coordinator',
  description: 'Orchestrate a complex task across multiple parallel sub-agents (research, plan, implement, verify).',
  risk: 'HIGH',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string', description: 'High-level task to orchestrate' } },
    required: ['task'],
  },
  async execute(input): Promise<{ content: string; isError?: boolean }> {
    const coord = new Coordinator((m) => process.stderr.write(`${m}\n`));
    const report = await coord.orchestrate(String(input.task ?? ''));
    return { content: report };
  },
};
