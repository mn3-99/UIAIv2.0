// agent/memdir/memoryTypes.ts
// Types de memoire (doc 09).

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryFile {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
  filePath: string;
}

export interface MemoryFrontmatter {
  name: string;
  description: string;
  type: MemoryType;
}
