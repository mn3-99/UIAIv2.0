export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  modelId?: string;
  providerId?: string;
  /**
   * Message lifecycle states for the smart queue system:
   * pending → queued (waiting in line) → thinking (model reasoning) →
   * streaming/responding (tokens flowing) → complete | error
   */
  status?: 'pending' | 'queued' | 'thinking' | 'streaming' | 'responding' | 'complete' | 'error';
  errorDetails?: string;
  isImage?: boolean;
  thinking?: string;
  thinkingDurationMs?: number;
  searchSources?: SearchSource[];
  /** Area 2: structured deep-search output (reasoning steps + numbered references) */
  deepSearch?: {
    needs_search: boolean;
    reasoning_steps?: { step: number; title: string; detail: string }[];
    references?: { num: number; title: string; url: string }[];
  };
  attachments?: FileAttachment[];
  /** Heuristic follow-up question chips attached after the answer completes */
  followUps?: string[];
  /** Arena (side-by-side model comparison) fields */
  arenaGroup?: string;
  arenaLabel?: string;
  arenaStats?: { ttftMs?: number; totalMs?: number; charsPerSec?: number };
  arenaVote?: 'left' | 'right' | 'tie' | null;
}

export interface FileAttachment {
  id: string;
  name: string;
  url: string;
  mime: string;
  size?: number;
  /** Extracted plain text for documents (PDF/TXT/MD/code) — sent as chat context. */
  textContent?: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
  modelId: string;
  providerId: string;
  systemPrompt?: string;
  draftMessage?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  icon?: string;
  is_free?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  isBuiltIn: boolean;
  requiresApiKey: boolean;
  isFree?: boolean;
  models: ModelOption[];
}

export type ThemeOption = 'system' | 'emerald-slate' | 'obsidian-amber' | 'dark' | 'light';

export interface AppSettings {
  schemaVersion: number;
  theme: ThemeOption;
  fontSize: 'sm' | 'base' | 'lg';
  temperature: number;
  systemPrompt: string;
  activeProviderId: string;
  activeModelId: string;
  customProviders: ProviderConfig[];
  apiKeys: Record<string, string>; // providerId -> apiKey
  passwordProtected: boolean;
  passwordHash?: string;
  userAuthToken?: string;
  autoTitle: boolean;
  soundEnabled: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  statusText?: string;
  modelsFound?: number;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  chats: ChatSession[];
  settings?: Partial<AppSettings>;
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  created_at?: string;
  ip_address?: string;
  device_info?: string;
}
