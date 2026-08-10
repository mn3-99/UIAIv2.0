export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  modelId?: string;
  providerId?: string;
  status?: 'streaming' | 'complete' | 'error';
  errorDetails?: string;
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

export type ThemeOption = 'emerald-slate' | 'obsidian-amber' | 'dark' | 'light';

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
