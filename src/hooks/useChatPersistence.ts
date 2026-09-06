import { useEffect, useRef } from 'react';
import type { AppSettings, ChatSession, UserAccount } from '../types';
import { saveChats, saveSettings } from '../utils/storage';
import { toast } from '../components/Toast';

interface PersistenceDeps {
  chats: ChatSession[];
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  settings: AppSettings;
  activeChatId: string | null;
  input: string;
  setInput: (v: string) => void;
  setCurrentUser: (u: UserAccount | null) => void;
  setUserName: (n: string) => void;
}

/** JWT-authenticated fetch helper (null when the visitor has no token). */
export const authedFetch = (inputUrl: string, init: RequestInit = {}) => {
  const token = localStorage.getItem('mijlai_auth_token');
  if (!token) return null;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(inputUrl, { ...init, headers });
};

/**
 * Owns every storage side effect that used to live inline in App.tsx:
 *   • localStorage save (chats debounced 600ms, settings immediate)
 *   • per-chat draft save/restore (600ms debounce, flush on switch)
 *   • pagehide flush so the last tokens are never lost
 *   • cloud sync: session restore from JWT, pull-once + push-debounced
 * Behavior is identical to the previous inline code — same timings and order.
 */
export function useChatPersistence({
  chats, setChats, settings, activeChatId, input, setInput, setCurrentUser, setUserName,
}: PersistenceDeps) {
  // ── Per-chat draft persistence ────────────────────────────────────────────
  // Keeps a half-written message attached to its chat so switching conversations
  // (or reloading) never loses what the user was typing.
  const inputRef = useRef(input);
  inputRef.current = input;
  const prevChatIdRef = useRef<string | null>(null);
  const skipDraftSaveRef = useRef(false);

  // On chat switch: save the outgoing chat's draft, then restore the new one
  useEffect(() => {
    const prevId = prevChatIdRef.current;
    if (prevId && prevId !== activeChatId) {
      const draft = inputRef.current;
      setChats(prev => prev.map(c => (c.id === prevId ? { ...c, draftMessage: draft } : c)));
    }
    prevChatIdRef.current = activeChatId;
    skipDraftSaveRef.current = true;
    const nextChat = chats.find(c => c.id === activeChatId);
    setInput(nextChat?.draftMessage || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  // Debounced draft save for the current chat
  useEffect(() => {
    if (!activeChatId) return;
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      setChats(prev => prev.map(c => (c.id === activeChatId ? { ...c, draftMessage: input } : c)));
    }, 500);
    return () => clearTimeout(t);
  }, [input, activeChatId, setChats]);

  // ── Cloud sync: restore session from a saved token, then merge chats ──────
  // Restore logged-in user from stored token on boot
  useEffect(() => {
    (async () => {
      const res = authedFetch('/api/auth/me');
      if (!res) return;
      try {
        const r = await res;
        if (!r.ok) {
          localStorage.removeItem('mijlai_auth_token');
          return;
        }
        const me = await r.json();
        setCurrentUser({
          id: me.user_id, username: me.email?.split('@')[0] || me.user_id,
          email: me.email || '', role: me.role === 'admin' ? 'admin' : 'user', status: 'active'
        });
        setUserName(me.email?.split('@')[0] || me.user_id);
      } catch { /* offline — keep guest */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull server chats on boot (merge: newer updatedAt wins, server copy included)
  useEffect(() => {
    (async () => {
      const res = authedFetch('/api/sync/chats');
      if (!res) return;
      try {
        const r = await res;
        if (!r.ok) return;
        const data = await r.json();
        const serverChats = (Array.isArray(data.chats) ? data.chats : []) as ChatSession[];
        if (serverChats.length === 0) return;
        setChats(prev => {
          const byId = new Map<string, ChatSession>(prev.map(c => [c.id, c] as [string, ChatSession]));
          for (const sc of serverChats) {
            const local = byId.get(sc.id);
            if (!local || (sc.updatedAt || 0) > (local.updatedAt || 0)) {
              byId.set(sc.id, { ...sc, messages: Array.isArray(sc.messages) ? sc.messages : [] });
            }
          }
          return Array.from(byId.values()).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
        });
        toast.info(`تمت مزامنة ${serverChats.length} محادثة من حسابك السحابي`);
      } catch { /* offline */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push chats (debounced) whenever they change and a token exists
  useEffect(() => {
    const token = localStorage.getItem('mijlai_auth_token');
    if (!token || chats.length === 0) return;
    const t = setTimeout(() => {
      authedFetch('/api/sync/chats', {
        method: 'POST',
        body: JSON.stringify({ chats: chats.slice(0, 200) })
      })?.catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [chats]);

  // Save chats & settings to localStorage.
  // Chats are debounced: during streaming a token arrives every few ms and
  // serializing the WHOLE history on every token froze low-end phones.
  // Settings stay immediate (tiny payload).
  useEffect(() => {
    const t = setTimeout(() => saveChats(chats), 600);
    return () => clearTimeout(t);
  }, [chats]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Flush pending chat persistence immediately when the page is hidden/closed
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  useEffect(() => {
    const flush = () => saveChats(chatsRef.current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
