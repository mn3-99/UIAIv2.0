// agent/tools/TaskTools/index.ts
// Outils de gestion des taches (doc 04 : TaskCreate/Get/List/Update).

import type { Tool, ToolResult } from '../../Tool';
import { createTask, getTask, listTasks, updateTask, runTask } from '../../tasks/index';
import { exec } from 'node:child_process';

export const TaskCreateTool: Tool = {
  name: 'TaskCreate',
  description: 'Create a background task. If a `command` is provided it runs asynchronously and its status can be tracked.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Task description' },
      command: { type: 'string', description: 'Optional shell command to run in the background' },
      background: { type: 'boolean', description: 'Run the command in the background' },
    },
    required: ['description'],
  },
  async execute(input): Promise<ToolResult> {
    const description = String(input.description ?? '');
    if (input.command) {
      const task = runTask(description, () => new Promise<string>((resolve, reject) => {
        exec(String(input.command), { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.toString());
        });
      }));
      return { content: `tache ${task.id} lancee en arriere-plan: ${input.command}` };
    }
    const task = createTask(description);
    return { content: `tache ${task.id} creee` };
  },
};

export const TaskGetTool: Tool = {
  name: 'TaskGet',
  description: 'Get the status of a task by id.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Task id' } },
    required: ['id'],
  },
  async execute(input): Promise<ToolResult> {
    const task = getTask(String(input.id ?? ''));
    if (!task) return { content: `Error: task '${input.id}' introuvable`, isError: true };
    return { content: JSON.stringify(task, null, 2) };
  },
};

export const TaskListTool: Tool = {
  name: 'TaskList',
  description: 'List all background tasks.',
  risk: 'LOW',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    const tasks = listTasks();
    if (tasks.length === 0) return { content: '(aucune tache)' };
    return { content: tasks.map((t) => `${t.id} [${t.status}] ${t.description}`).join('\n') };
  },
};

export const TaskUpdateTool: Tool = {
  name: 'TaskUpdate',
  description: 'Update a task status or result.',
  risk: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task id' },
      status: { type: 'string', enum: ['pending', 'running', 'done', 'failed'] },
      result: { type: 'string' },
    },
    required: ['id'],
  },
  async execute(input): Promise<ToolResult> {
    const task = updateTask(String(input.id ?? ''), {
      ...(input.status ? { status: input.status as 'pending' | 'running' | 'done' | 'failed' } : {}),
      ...(input.result !== undefined ? { result: String(input.result) } : {}),
    });
    if (!task) return { content: `Error: task '${input.id}' introuvable`, isError: true };
    return { content: `task ${task.id} -> ${task.status}` };
  },
};
