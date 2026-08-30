// agent/commands/memory.ts
// /memory : consulte/ajoute/supprime des memoires persistantes (doc 09).

import type { Command } from '../commands';
import type { MemoryType } from '../memdir/memoryTypes';
import { addMemory, loadMemories } from '../memdir/memdir';
import { deleteMemory } from '../memdir/memoryFile';

export const memoryCommand: Command = {
  name: 'memory',
  description: 'Gere la memoire persistante: /memory [list|add|rm]',
  async run(args) {
    const [sub, ...rest] = args.trim().split(/\s+/);
    if (!sub || sub === 'list') {
      const memories = loadMemories();
      if (memories.length === 0) return '(aucune memoire)';
      return memories.map((m) => `- [${m.type}] ${m.name}: ${m.description}`).join('\n');
    }
    if (sub === 'add') {
      // Syntaxe: /memory add <type> <nom> :: <description> :: <contenu>
      const arg = rest.join(' ');
      const parts = arg.split('::').map((s) => s.trim());
      const head = (parts[0] || '').split(/\s+/);
      const type = (head[0] as MemoryType) || 'project';
      const name = head.slice(1).join(' ') || 'Note';
      const content = parts[2] || '';
      const description = parts[1] || content.slice(0, 80);
      if (!['user', 'feedback', 'project', 'reference'].includes(type)) {
        return 'Type invalide: user | feedback | project | reference';
      }
      addMemory({ name, description, type, content });
      return `Memoire ajoutee: ${name}`;
    }
    if (sub === 'rm') {
      const name = rest.join(' ');
      return deleteMemory(name) ? `Memoire supprimee: ${name}` : `Memoire introuvable: ${name}`;
    }
    return 'Usage: /memory [list] | /memory add <type> <nom> :: <description> :: <contenu> | /memory rm <nom>';
  },
};
