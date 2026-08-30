// agent/memdir/memoryFile.ts
// Operations CRUD sur les fichiers memoire (doc 09).

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MEMORY_DIR } from './memdir';
import type { MemoryFile, MemoryFrontmatter, MemoryType } from './memoryTypes';

const MAX_INDEX_LINES = 200;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Ecrit un fichier memoire (frontmatter + contenu) et met a jour l'index. */
export function saveMemory(input: {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}): MemoryFile {
  const file = `${slugify(input.name)}.md`;
  const filePath = join(MEMORY_DIR, file);
  const frontmatter: MemoryFrontmatter = {
    name: input.name,
    description: input.description,
    type: input.type,
  };
  const body = `---\nname: ${frontmatter.name}\ndescription: ${frontmatter.description}\ntype: ${frontmatter.type}\n---\n\n${input.content}\n`;
  writeFileSync(filePath, body, 'utf-8');
  updateIndex({ ...input, filePath });
  return { ...frontmatter, content: input.content, filePath };
}

/** Parse le frontmatter + contenu d'un fichier memoire. */
export function parseMemoryFile(raw: string, filePath: string): MemoryFile {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { name: basename(filePath), description: '', type: 'project', content: raw, filePath };
  }
  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return {
    name: fm['name'] ?? basename(filePath),
    description: fm['description'] ?? '',
    type: (fm['type'] as MemoryType) ?? 'project',
    content: match[2].trim(),
    filePath,
  };
}

/** Charge toutes les memoires referencees par l'index MEMORY.md. */
export function loadMemories(): MemoryFile[] {
  const indexPath = join(MEMORY_DIR, 'MEMORY.md');
  if (!existsSync(indexPath)) return [];
  const index = readFileSync(indexPath, 'utf-8');
  const memories: MemoryFile[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(index)) !== null) {
    const target = join(MEMORY_DIR, m[2]);
    if (existsSync(target)) {
      try {
        memories.push(parseMemoryFile(readFileSync(target, 'utf-8'), target));
      } catch {
        continue;
      }
    }
  }
  return memories;
}

/** Met a jour (ou ajoute) une entree dans l'index MEMORY.md. */
export function updateIndex(memory: { name: string; description: string; filePath: string }): void {
  const indexPath = join(MEMORY_DIR, 'MEMORY.md');
  const file = basename(memory.filePath);
  let lines: string[] = existsSync(indexPath)
    ? readFileSync(indexPath, 'utf-8').split('\n').filter((l) => l.trim() !== '')
    : [];

  const entry = `- [${memory.name}](${file}) — ${memory.description}`;
  const existingIdx = lines.findIndex((l) => l.includes(`(${file})`));
  if (existingIdx >= 0) lines[existingIdx] = entry;
  else lines.push(entry);

  if (lines.length > MAX_INDEX_LINES) lines = lines.slice(0, MAX_INDEX_LINES);
  mkdirSync(MEMORY_DIR, { recursive: true });
  writeFileSync(indexPath, lines.join('\n') + '\n', 'utf-8');
}

/** Supprime une memoire et sa reference d'index. */
export function deleteMemory(name: string): boolean {
  const mem = loadMemories().find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (!mem) return false;
  unlinkSync(mem.filePath);
  const indexPath = join(MEMORY_DIR, 'MEMORY.md');
  const lines = readFileSync(indexPath, 'utf-8')
    .split('\n')
    .filter((l) => !l.includes(`(${basename(mem.filePath)})`));
  writeFileSync(indexPath, lines.join('\n') + '\n', 'utf-8');
  return true;
}
