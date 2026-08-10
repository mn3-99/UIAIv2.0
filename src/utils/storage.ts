import { ChatSession, AppSettings, BackupData } from '../types';
import { APP_CONFIG } from '../config';

const CHATS_STORAGE_KEY = 'mijlai_v1_chats';
const SETTINGS_STORAGE_KEY = 'mijlai_v1_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: APP_CONFIG.storageSchemaVersion,
  theme: 'emerald-slate',
  fontSize: 'base',
  temperature: 0.7,
  systemPrompt: APP_CONFIG.defaultSystemPrompt,
  activeProviderId: 'g4f',
  activeModelId: 'g4f:gpt-4o',
  customProviders: [],
  apiKeys: {},
  passwordProtected: false,
  autoTitle: true,
  soundEnabled: false
};

/**
 * Load settings with safe schema migration support
 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    
    const parsed = JSON.parse(raw);
    
    // Ensure active provider is g4f if it was set to an old non-g4f default
    if (parsed.activeProviderId && parsed.activeProviderId !== 'g4f' && !parsed.activeProviderId.startsWith('custom-')) {
      parsed.activeProviderId = 'g4f';
      parsed.activeModelId = 'g4f:gpt-4o';
    }

    if (!parsed.activeModelId || !parsed.activeModelId.startsWith('g4f:')) {
      if (parsed.activeProviderId === 'g4f') {
        parsed.activeModelId = 'g4f:gpt-4o';
      }
    }
    
    // Schema migration checks
    if (!parsed.schemaVersion || parsed.schemaVersion < APP_CONFIG.storageSchemaVersion) {
      console.log('Migrating settings schema to version', APP_CONFIG.storageSchemaVersion);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        schemaVersion: APP_CONFIG.storageSchemaVersion
      };
    }
    
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.error('Failed to load settings from localStorage:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings to localStorage:', err);
  }
}

/**
 * Load chat sessions with safe migration
 */
export function loadChats(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHATS_STORAGE_KEY);
    if (!raw) return [];
    
    const chats: ChatSession[] = JSON.parse(raw);
    if (!Array.isArray(chats)) return [];
    
    // Ensure all sessions have valid structure
    return chats.map(chat => ({
      ...chat,
      messages: Array.isArray(chat.messages) ? chat.messages : [],
      pinned: !!chat.pinned,
      createdAt: chat.createdAt || Date.now(),
      updatedAt: chat.updatedAt || Date.now()
    }));
  } catch (err) {
    console.error('Failed to load chats from localStorage:', err);
    return [];
  }
}

/**
 * Save chat sessions to localStorage
 */
export function saveChats(chats: ChatSession[]): void {
  try {
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch (err) {
    console.error('Failed to save chats to localStorage:', err);
  }
}

/**
 * Export full backup as downloadable JSON blob
 */
export function exportBackup(chats: ChatSession[], settings: AppSettings): void {
  const data: BackupData = {
    version: APP_CONFIG.storageSchemaVersion,
    exportedAt: new Date().toISOString(),
    chats,
    settings: {
      theme: settings.theme,
      fontSize: settings.fontSize,
      temperature: settings.temperature,
      systemPrompt: settings.systemPrompt,
      activeProviderId: settings.activeProviderId,
      activeModelId: settings.activeModelId,
      customProviders: settings.customProviders,
      autoTitle: settings.autoTitle
    }
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `MijlAi_Backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import backup data safely
 */
export function importBackup(fileContent: string): { chats: ChatSession[]; settings?: Partial<AppSettings> } {
  const parsed = JSON.parse(fileContent);
  if (!parsed || !Array.isArray(parsed.chats)) {
    throw new Error('ملف النسخة الاحتياطية غير صالح (صيغة JSON غير مطابقة)');
  }
  return {
    chats: parsed.chats,
    settings: parsed.settings
  };
}

/**
 * Generate quick auto-title for conversation from first message
 */
export function generateTitleFromMessage(message: string): string {
  if (!message) return 'محادثة جديدة';
  const clean = message.trim().replace(/[\r\n]+/g, ' ');
  if (clean.length <= 35) return clean;
  return clean.substring(0, 35) + '...';
}
