// agent/tasks/index.ts
// Gestion des taches en arriere-plan (doc 01 structure ; outils Task* du doc 04).

import { randomUUID } from 'node:crypto';

export interface BackgroundTask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
  result?: string;
}

const tasks = new Map<string, BackgroundTask>();

export function createTask(description: string): BackgroundTask {
  const now = new Date().toISOString();
  const task: BackgroundTask = { id: randomUUID().slice(0, 8), description, status: 'pending', createdAt: now, updatedAt: now };
  tasks.set(task.id, task);
  return task;
}

export function getTask(id: string): BackgroundTask | undefined {
  return tasks.get(id);
}

export function listTasks(): BackgroundTask[] {
  return [...tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function updateTask(id: string, patch: Partial<Pick<BackgroundTask, 'status' | 'result' | 'description'>>): BackgroundTask | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  return task;
}

/** Execute une fonction en arriere-plan comme tache suivie. */
export function runTask(description: string, fn: () => Promise<string>): BackgroundTask {
  const task = createTask(description);
  task.status = 'running';
  fn()
    .then((result) => updateTask(task.id, { status: 'done', result }))
    .catch((err) => updateTask(task.id, { status: 'failed', result: err instanceof Error ? err.message : String(err) }));
  return task;
}
