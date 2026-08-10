/**
 * MijlAi Native Adapter — Cross-Platform Bridge
 * Provides unified APIs for Web, Desktop (Windows, macOS, Linux) and Mobile (Android, iOS)
 */

export interface NativeChatMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  model_id?: string;
  timestamp: number;
}

export const isTauriNative = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

// Haptic feedback trigger for mobile/desktop UI
export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof window === 'undefined') return;

  // 1. Standard Web Vibration API
  if ('vibrate' in navigator) {
    try {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [35]
      };
      navigator.vibrate(patterns[type] || [10]);
    } catch (e) {
      // Ignored
    }
  }

  // 2. Tauri Native Haptic Invoke if active
  if (isTauriNative()) {
    try {
      const invoke = (window as any).__TAURI__?.core?.invoke;
      if (invoke) {
        invoke('trigger_haptic_feedback', { level: type }).catch(() => {});
      }
    } catch (e) {
      // Ignored
    }
  }
};

// Initialize Mobile Soft Keyboard Visual Viewport Listener
export const setupVisualViewportKeyboard = (onHeightChange?: (keyboardHeight: number) => void) => {
  if (typeof window === 'undefined' || !window.visualViewport) return () => {};

  const handleResize = () => {
    if (!window.visualViewport) return;
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    if (onHeightChange) {
      onHeightChange(keyboardHeight > 100 ? keyboardHeight : 0);
    }
  };

  window.visualViewport.addEventListener('resize', handleResize);
  window.visualViewport.addEventListener('scroll', handleResize);

  return () => {
    if (!window.visualViewport) return;
    window.visualViewport.removeEventListener('resize', handleResize);
    window.visualViewport.removeEventListener('scroll', handleResize);
  };
};

// Native Local SQLite Persistence via Tauri
export const saveMessageLocally = async (msg: NativeChatMessage): Promise<boolean> => {
  if (isTauriNative()) {
    try {
      const invoke = (window as any).__TAURI__?.core?.invoke;
      if (invoke) {
        return await invoke('save_local_message', { message: msg });
      }
    } catch (err) {
      console.warn('Native SQLite save failed:', err);
    }
  }
  return false;
};

export const getLocalChatHistory = async (chatId: string): Promise<NativeChatMessage[]> => {
  if (isTauriNative()) {
    try {
      const invoke = (window as any).__TAURI__?.core?.invoke;
      if (invoke) {
        return await invoke('get_local_chat_history', { chatId });
      }
    } catch (err) {
      console.warn('Native SQLite fetch failed:', err);
    }
  }
  return [];
};
