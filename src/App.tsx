import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowDown, Maximize2, Minimize2, SquarePen, Settings as SettingsIcon, Folder as FolderIcon, LayoutGrid as LayoutGridIcon, Download, Moon } from 'lucide-react';

import { MijlaiSidebar } from './components/MijlaiSidebar';
import { MijlaiHeader } from './components/MijlaiHeader';
import { MijlaiComposer } from './components/MijlaiComposer';
import { MijlaiLogo } from './components/MijlaiLogo';
import { ChatMessageItem } from './components/ChatMessageItem';
import { CanvasPanel, CanvasKind } from './components/CanvasPanel';
import { SettingsModal } from './components/SettingsModal';
import { PasswordGateModal } from './components/PasswordGateModal';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import {
  FilesModal, GemsModal, UpgradeModal, PromptEditModal, ProfileModal
} from './components/MijlaiModals';
import { AuthModal } from './components/AuthModal';
import { AdminControlPanelModal } from './components/AdminControlPanelModal';
import { ToastHost, toast } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { ArenaPairView } from './components/ArenaPairView';
import { SkillsBar } from './components/SkillsBar';
import { SkillsManagerModal } from './components/SkillsManagerModal';
import { OnboardingModal, isOnboardingDone } from './components/OnboardingModal';
import { ImageStudio } from './components/ImageStudio';
import { applyTheme, isDarkTheme } from './utils/theme';
import { GEMS, getGemPrompt } from './utils/gems';
import { generateFollowUps } from './utils/followUps';
import { createStreamBatcher } from './utils/streamSmoothing';
import { stopSpeaking } from './utils/tts';
import { getFullRegistry, setSkillEnabled, getActivePromptPacks, SkillDefinition } from './utils/skillsRegistry';
import { Code, BookOpen, PenLine, Languages, Sparkles } from 'lucide-react';

import { ChatSession, ChatMessage, AppSettings, UserAccount } from './types';
import { APP_CONFIG } from './config';
import {
  loadSettings, saveSettings, loadChats, saveChats,
  exportBackup, importBackup, generateTitleFromMessage, hashPassword, safeEqual
} from './utils/storage';
import { connectionManager, ConnectionStatus } from './utils/connectionManager';
import { registerServiceWorker } from './swRegister';
import { triggerHaptic, setupVisualViewportKeyboard, saveMessageLocally } from './utils/nativeAdapter';
import type { FileAttachment } from './types';

// Quick-start suggestions shown on the empty chat screen — one tap to a great prompt
const STARTER_PROMPTS = [
  { icon: Code, text: 'اكتب لي دالة TypeScript لإنشاء SSE stream في Express مع شرح مبسط' },
  { icon: BookOpen, text: 'اشرح لي الفرق بين REST و GraphQL بجدول مقارنة وأمثلة عملية' },
  { icon: PenLine, text: 'صغ لي رسالة بريد إلكتروني مهنية بالعربية لتقديم مشروع تقني' },
  { icon: Languages, text: 'ترجم هذه الجملة إلى الإنجليزية مع تحسين الصياغة: ...' },
];

export default function App() {
  // Application State
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [chats, setChats] = useState<ChatSession[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Mhmod');

  // Model Tier state: flash, pro, thinking, claude, deepseek, kimi
  const [selectedTier, setSelectedTier] = useState<string>('coder');

  // Focus Mode (distraction-free): hides sidebar & header
  const [focusMode, setFocusMode] = useState(false);

  // Input & Streaming State
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  // Smart Message Queue — رسائل تنتظر دورها أثناء التوليد (pending → queued → thinking → responding → complete)
  const [messageQueue, setMessageQueue] = useState<Array<{
    id: string; text: string; chatId: string; userMsgId: string; assistantMsgId: string;
  }>>([]);
  // Skills & Plugins registry state (واجهة الشريط السفلي وصفحة الإدارة)
  const [skillsRegistry, setSkillsRegistry] = useState<SkillDefinition[]>(() => getFullRegistry());
  const [isSkillsManagerOpen, setIsSkillsManagerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // Sidebar overlay state — hidden by default; the chat area fills the whole screen.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [canvasContent, setCanvasContent] = useState('');
  const [canvasKind, setCanvasKind] = useState<CanvasKind | undefined>(undefined);

  // Open an artifact (html/svg/mermaid code block) in the live Canvas panel.
  const handleOpenCanvasArtifact = (code: string, language: string) => {
    const lang = (language || '').toLowerCase();
    const kind: CanvasKind = lang === 'svg' || lang === 'xml' ? 'svg' : lang === 'mermaid' ? 'mermaid' : 'html';
    setCanvasContent(code);
    setCanvasKind(kind);
    setIsCanvasOpen(true);
  };

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isGemsOpen, setIsGemsOpen] = useState(false);
  const [isImageStudioOpen, setIsImageStudioOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isPromptEditOpen, setIsPromptEditOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // Active persona (Gem) applied to the current chat's system instructions
  const [activeGemId, setActiveGemId] = useState<string | null>(null);
  // Arena mode: send the same prompt to two models and compare side-by-side
  const [arenaMode, setArenaMode] = useState(false);
  const [arenaModelA, setArenaModelA] = useState<string>('flash');
  const [arenaModelB, setArenaModelB] = useState<string>('pro');
  // Live arena stream handles (so Stop severs both)
  const arenaStreamsRef = useRef<EventSource[]>([]);

  // User Auth & Web Search Grounding state
  // (restored from a valid stored JWT on boot — no fake default session)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false);

  // Models state
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string; icon?: string; is_free?: boolean}>>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  const [isUnlocked, setIsUnlocked] = useState(!settings.passwordProtected);
  // ترحيب أول مرة — يظهر بعد تجاوز بوابة القفل فقط
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(connectionManager.getStatus());
  const [isOnline, setIsOnline] = useState(connectionManager.isOnline());

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Tracks the currently active background job so Stop can abort it server-side
  const activeJobRef = useRef<string | null>(null);
  // Holds the live SSE connection + its finalizer so Stop can sever the stream
  // immediately (without waiting for the server-side done event).
  const activeStreamRef = useRef<{ eventSource: EventSource; finalize: (status: 'complete' | 'error', errorDetails?: string) => void } | null>(null);

  // Load models from API on app init
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) {
            setAvailableModels(data.models);
          }
        }
      } catch (err) {
        console.warn('Failed to load models:', err);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

  // Sync selectedTier with settings.activeModelId
  const modelIdToTier: Record<string, string> = {
    'gemini': 'flash',
    'gpt-4': 'pro',
    'gemini-3.6-flash': 'qwen',
    'gemini-3.5-flash': 'thinking',
    'gemini-auto': 'deepseek',
    'command-a': 'claude',
    'aria': 'kimi',
    'direct:mijlai-pwr': 'pwr',
    'direct:Qwen3-Coder-30B-A3B-Instruct': 'coder'
  };

  // Apply the saved theme (body[data-theme] drives the CSS variables; 'system'
  // follows the OS appearance live via the media-query listener in applyTheme).
  useEffect(() => {
    if (settings.theme) {
      applyTheme(settings.theme);
    }
  }, [settings.theme]);

  useEffect(() => {
    if (settings.activeModelId) {
      if (settings.activeModelId.startsWith('local:')) {
        setSelectedTier(settings.activeModelId);
      } else if (modelIdToTier[settings.activeModelId]) {
        setSelectedTier(modelIdToTier[settings.activeModelId]);
      }
    }
  }, [settings.activeModelId]);

  // Register PWA Service Worker & Native Keyboard Listener on app init
  useEffect(() => {
    registerServiceWorker();
    const cleanupKeyboard = setupVisualViewportKeyboard();
    return () => {
      cleanupKeyboard();
    };
  }, []);

  // Focus Mode keyboard shortcut (Ctrl/Cmd+Shift+F) — Escape also exits
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // Cmd/Ctrl+K — open the command palette (power-user navigation)
        e.preventDefault();
        setIsPaletteOpen((o) => !o);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        // Entering focus mode also collapses the sidebar overlay
        if (!focusMode) setIsSidebarOpen(false);
        setFocusMode(f => !f);
      } else if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  // Pressing Escape closes the sidebar overlay whenever it is open
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // Accessibility: move focus into the drawer on open; return it to the menu
  // toggle on close when focus was still inside the drawer.
  useEffect(() => {
    if (focusMode) return;
    const panel = document.getElementById('mijlai_sidebar');
    if (isSidebarOpen) {
      panel?.focus();
    } else if (panel?.contains(document.activeElement)) {
      document.getElementById('sidebar_toggle_btn')?.focus();
    }
  }, [isSidebarOpen, focusMode]);

  // Connection Manager Subscription
  useEffect(() => {
    const unsubscribe = connectionManager.subscribe((status) => {
      setConnectionStatus(status);
      setIsOnline(status !== 'offline');
    });
    return () => unsubscribe();
  }, []);

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
  }, [input, activeChatId]);

  // ── Cloud Chat Sync (SQLite backend, JWT-scoped) ──────────────────────────
  // Restore session from a saved token, then last-write-wins merge with the server.
  const authedFetch = (inputUrl: string, init: RequestInit = {}) => {
    const token = localStorage.getItem('mijlai_auth_token');
    if (!token) return null;
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(inputUrl, { ...init, headers });
  };

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
      } catch { /* offline — keep guest */ }
    })();
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
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Map model tier to specific backend model ID.
  // Tiers are pinned to benchmark-verified endpoints (stress-tested):
  //   mini  -> GPT-Mini via Yqcloud (fastest stream, 198 tok/s)
  //   flash -> Sonar via Perplexity (1.9s TTFT, 100% reliable)
  //   pro   -> Gemini via Google (strongest quality, 158 tok/s)
  //   coder -> Qwen3-Coder-30B direct via OVHcloud (0.4s TTFT, coding specialist)
  const getModelIdForTier = (tier: string) => {
    switch (tier) {
      case 'mini':
        return 'gpt-4o-mini';
      case 'flash':
        return 'sonar';
      case 'pro':
        return 'gemini';
      case 'coder':
        return 'direct:Qwen3-Coder-30B-A3B-Instruct';
      case 'pwr':
        return 'direct:mijlai-pwr';
      // Legacy tier aliases kept for old saved sessions
      case 'thinking':
        return 'gemini';
      case 'claude':
        return 'command-a';
      case 'deepseek':
      case 'kimi':
      case 'qwen':
        return 'sonar';
      default:
        return tier.startsWith('local:') ? tier : 'gpt-4o-mini';
    }
  };

  // Active chat session reference
  const activeChat = chats.find(c => c.id === activeChatId) || null;

  // Local llama.cpp models discovered by the backend (/api/models provider === 'llama')
  const localModels = useMemo(
    () => (availableModels || [])
      .filter((m) => m.provider === 'llama')
      .map((m) => ({ id: m.id, name: m.name })),
    [availableModels]
  );

  // Closes the sidebar overlay (and its history drawer) — used by overlay click,
  // Escape, chat selection and new-chat actions.
  const closeSidebar = () => {
    setIsSidebarOpen(false);
    setIsHistoryOpen(false);
  };

  // Create New Chat Session
  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title: 'محادثة جديدة',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      modelId: getModelIdForTier(selectedTier),
      providerId: 'g4f'
    };
    setChats(prev => [newSession, ...prev]);
    setActiveChatId(newSession.id);
    setInput('');
    closeSidebar();
  };

  // Scroll Container Control
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollToBottom(!isAtBottom);
  };

  const scrollToBottom = (smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  // Build conversation history for multi-turn context. Only meaningful,
  // completed turns are included (empty/error/image placeholders excluded).
  const buildHistory = (messages: ChatMessage[]) =>
    messages
      .filter(m => m.content.trim() !== '' && m.status !== 'error' && !m.isImage)
      .slice(-24)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  // Send Prompt with Decoupled Zero-Latency Engine
  const handleSendMessage = async (customPrompt?: string, opts?: { history?: Array<{ role: string; content: string }>; reuseIds?: { chatId: string; userMsgId: string; assistantMsgId: string } }) => {
    // Arena mode intercepts fresh composer sends (edit/regenerate bypass it).
    if (arenaMode && !customPrompt && !opts?.history) {
      return handleArenaSend();
    }
    const textToSend = customPrompt || input;
    if (!textToSend.trim()) return;

    // ── نظام الطابور الذكي: أثناء التوليد تُحفظ الرسالة في طابور بدل رفضها ──
    if (isGenerating && !opts?.reuseIds) {
      const queueChatId = activeChatId;
      if (!queueChatId) return; // لا محادثة نشطة لاستقبال الطابور
      const qUserMsgId = `msg-${Date.now()}`;
      const qAssistantMsgId = `msg-${Date.now() + 1}`;
      const queuedUserMsg: ChatMessage = {
        id: qUserMsgId,
        role: 'user',
        content: textToSend.trim(),
        timestamp: Date.now(),
        attachments: attachments.length ? attachments : undefined
      };
      const queuedAssistantMsg: ChatMessage = {
        id: qAssistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        modelId: getModelIdForTier(selectedTier),
        providerId: 'g4f',
        status: 'queued'
      };
      setChats(prev => prev.map(c => c.id === queueChatId
        ? { ...c, messages: [...c.messages, queuedUserMsg, queuedAssistantMsg], updatedAt: Date.now() }
        : c));
      setMessageQueue(prev => [...prev, {
        id: `q-${Date.now()}`,
        text: textToSend.trim(),
        chatId: queueChatId,
        userMsgId: qUserMsgId,
        assistantMsgId: qAssistantMsgId
      }]);
      setInput('');
      setAttachments([]);
      triggerHaptic('light');
      toast.info('أُضيفت رسالتك للطابور — ستُرسل تلقائياً فور اكتمال الرد الحالي');
      return;
    }
    stopSpeaking();

    let targetChatId = opts?.reuseIds ? opts.reuseIds.chatId : activeChatId;

    if (!targetChatId) {
      const newSession: ChatSession = {
        id: `chat-${Date.now()}`,
        title: generateTitleFromMessage(textToSend),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        modelId: getModelIdForTier(selectedTier),
        providerId: 'g4f'
      };
      setChats(prev => [newSession, ...prev]);
      targetChatId = newSession.id;
      setActiveChatId(newSession.id);
    }

    // Multi-turn context: prior messages + the new prompt as the final user turn.
    // Without this every question was answered in isolation (no conversation memory).
    const history = opts?.history ?? buildHistory(activeChat?.messages || []);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now(),
      attachments: attachments.length ? attachments : undefined
    };

    const assistantMsgId = opts?.reuseIds?.assistantMsgId ?? `msg-${Date.now() + 1}`;

    if (opts?.reuseIds) {
      // عنصر مسترد من الطابور: الفقاعات موجودة مسبقاً — نفعّل حالة التفكير فقط
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            updatedAt: Date.now(),
            messages: c.messages.map(m =>
              m.id === assistantMsgId ? { ...m, status: 'thinking' as const } : m)
          };
        }
        return c;
      }));
    } else {
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        modelId: getModelIdForTier(selectedTier),
        providerId: 'g4f',
        status: 'thinking'
      };

      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const updatedMsgs = [...c.messages, userMsg, assistantMsg];
          const newTitle = c.messages.length === 0 ? generateTitleFromMessage(textToSend) : c.title;
          return {
            ...c,
            title: newTitle,
            messages: updatedMsgs,
            updatedAt: Date.now()
          };
        }
        return c;
      }));
    }

    triggerHaptic('light');
    setInput('');
    setAttachments([]);
    setIsGenerating(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      // Agentic Web Search: enrich the prompt with live results before sending
      let finalPrompt = textToSend.trim();
      let searchSources: { title: string; url: string; snippet?: string }[] | undefined;

      if (webSearchEnabled) {
        try {
          const searchRes = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: textToSend.trim(), max_results: 5 })
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const results: any[] = searchData?.results || [];
            if (results.length > 0) {
              searchSources = results.map((r: any) => ({ title: r.title || '', url: r.url || '', snippet: r.snippet || '' }));
              const contextBlock = results
                .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.url}\n${(r.snippet || '').slice(0, 300)}`)
                .join('\n\n');
              finalPrompt = `استعن بمصادر الويب التالية عند الإجابة، واستشهد بأرقامها [1] [2] عند الحاجة:\n\n${contextBlock}\n\n---\n\nسؤال المستخدم: ${textToSend.trim()}`;
            }
          }
        } catch (searchErr) {
          console.warn('Web search failed, continuing without context:', searchErr);
        }
      }

      // Attach search sources to the assistant bubble when they exist
      if (searchSources?.length) {
        setChats(prev => prev.map(c => {
          if (c.id !== targetChatId) return c;
          return {
            ...c,
            messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, searchSources } : m)
          };
        }));
      }

      // Personal Knowledge (local RAG): retrieve top chunks from the user's docs
      if (knowledgeEnabled && localStorage.getItem('mijlai_auth_token')) {
        try {
          const ragRes = await fetch('/api/rag/query', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('mijlai_auth_token')}`
            },
            body: JSON.stringify({ query: textToSend.trim(), top_k: 5 })
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json();
            const hits: Array<{ text: string; doc: string }> = ragData?.results || [];
            if (hits.length > 0) {
              const kbBlock = hits
                .map((h, i) => `[مستند ${i + 1} — ${h.doc}]
${h.text}`)
                .join('\n---\n');
              finalPrompt = `استعن بمقتطفات مستنداتي التالية عند الإجابة وعند الاقتباس أشر إليها [م1] [م2]:\n\n${kbBlock}\n\n---\n\nسؤالي: ${finalPrompt}`;
            }
          }
        } catch (ragErr) {
          console.warn('RAG retrieval failed, continuing without:', ragErr);
        }
      }

      // Decoupled Send request to FastAPI / Proxy (<10ms TTFB)
      // `messages` carries the full conversation so the model keeps context.
      // Image attachments become OpenAI vision content-parts for multimodal models.
      const imageAttachments = attachments.filter(a => a.mime.startsWith('image/'));

      // Document attachments (PDF/TXT/MD/code): inject extracted text as a
      // readable context block so the model answers FROM the actual content.
      const docAttachments = attachments.filter(a => !a.mime.startsWith('image/') && a.textContent);
      if (docAttachments.length > 0) {
        const docsBlock = docAttachments
          .map(a => `### محتوى الملف المرفق: ${a.name}\n\`\`\`\n${a.textContent}\n\`\`\``)
          .join('\n\n');
        finalPrompt = `الملفات التالية مرفقة من المستخدم — اقرأها وأجب بناءً عليها:\n\n${docsBlock}\n\n---\n\n${finalPrompt}`;
      }

      const finalUserContent = imageAttachments.length
        ? [
            { type: 'text', text: finalPrompt },
            ...imageAttachments.map(a => ({ type: 'image_url', image_url: { url: a.url } }))
          ]
        : finalPrompt;
      // Compose the customization layer: global user system prompt (Settings)
      // + active Gem persona + ACTIVE SKILL PROMPT PACKS (الشريط السفلي).
      // Applied server-side after the identity core.
      const styleInstructions = [settings.systemPrompt?.trim(), getGemPrompt(activeGemId), ...getActivePromptPacks()]
        .filter(Boolean)
        .join('\n\n');

      const sendRes = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          messages: [...history, { role: 'user', content: finalUserContent }],
          chat_id: targetChatId,
          model: getModelIdForTier(selectedTier),
          user_id: currentUser?.id || 'guest',
          email: currentUser?.email || 'guest@mijlai.com',
          ...(styleInstructions ? { system_prompt: styleInstructions } : {})
        })
      });

      if (!sendRes.ok) {
        throw new Error(`فشل الاتصال بالخادم (${sendRes.status})`);
      }

      const sendText = await sendRes.text();
      let sendData: any = {};
      try {
        sendData = JSON.parse(sendText);
      } catch (e) {
        throw new Error('استجابة غير صالحة من الخادم');
      }
      const taskId = sendData.task_id;
      if (!taskId) {
        throw new Error('لم يحصل الخادم على مهمة توليد (task_id). تأكد من توفر النموذج المحدد.');
      }
      activeJobRef.current = taskId;

      // Open SSE stream with offset resumption
      const eventSource = new EventSource(`/api/chat/stream/${encodeURIComponent(taskId)}?offset=0`);

      let fullText = '';
      let streamDone = false;
      const thinkStartRef = { current: 0 };
      let thinkText = '';

      // Frame-locked stream commit: tokens accumulate in plain strings and paint
      // at most once per animation frame instead of once per token (30–120/sec),
      // which keeps markdown rendering at display refresh rate. Zero token loss:
      // finalizeStream flushes synchronously before settling the message.
      const commitStream = () => {
        setChats(prev => prev.map(c => {
          if (c.id !== targetChatId) return c;
          return {
            ...c,
              messages: c.messages.map(m => {
              if (m.id !== assistantMsgId) return m;
              const patch: Partial<ChatMessage> = { content: fullText };
              // انتقال الحالة: thinking → streaming عند وصول أول توكن مرئي
              if (fullText && m.status === 'thinking') patch.status = 'streaming';
              if (thinkText && thinkText !== m.thinking) patch.thinking = thinkText;
              // Freeze thinking duration on the first answer token
              if (thinkText && fullText && !m.thinkingDurationMs) {
                patch.thinkingDurationMs = Date.now() - (thinkStartRef.current || Date.now());
              }
              return { ...m, ...patch } as ChatMessage;
            })
          };
        }));

        // Smart non-intrusive auto-scroll: only stick when already near the bottom
        if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          if (scrollHeight - scrollTop - clientHeight < 150) {
            scrollToBottom(false);
          }
        }
      };
      const streamBatcher = createStreamBatcher(commitStream);

      // Shared finalizer: marks the assistant message complete or failed exactly once,
      // closes the stream and clears the generating state (prevents reconnect/rate-limit loops).
      const finalizeStream = (status: 'complete' | 'error', errorDetails?: string) => {
        if (streamDone) return;
        streamDone = true;
        streamBatcher.flushNow(); // paint any buffered tokens before settling
        eventSource.close();
        if (activeStreamRef.current?.eventSource === eventSource) activeStreamRef.current = null;
        activeJobRef.current = null;
        setIsGenerating(false);
        if (status === 'complete') {
          triggerHaptic('medium');
          // Auto-open the live Canvas when the model produced a renderable
          // artifact (html/svg/mermaid) — the whole point of the feature.
          const artifactMatch = fullText.match(/```(html|svg|mermaid)\s*\n([\s\S]*?)```/i);
          if (artifactMatch) {
            const lang = artifactMatch[1].toLowerCase();
            setCanvasContent(artifactMatch[2].trim());
            setCanvasKind(lang === 'svg' ? 'svg' : lang === 'mermaid' ? 'mermaid' : 'html');
            setIsCanvasOpen(true);
          }
        }
        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      status: status === 'error' ? 'error' : 'complete',
                      errorDetails,
                      // Smart follow-up chips keep the conversation flowing
                      ...(status === 'complete' && fullText.trim()
                        ? { followUps: generateFollowUps(textToSend.trim(), fullText) }
                        : {})
                    }
                  : m
              )
            };
          }
          return c;
        }));
      };

      // Handles a single SSE payload (token or done). Used by BOTH the default
      // "message" event and the named "done" event (the server emits `event: done`).
      const handleStreamPayload = (data: any) => {
        if (data?.t === 'think') {
          const incoming = typeof data.d === 'string' ? data.d : '';
          if (!thinkStartRef.current) thinkStartRef.current = Date.now();
          thinkText = data.full ? incoming : thinkText + incoming;
          streamBatcher.schedule();
        } else if (data?.t === 'token' && data.d) {
          fullText += data.d;
          streamBatcher.schedule();
        } else if (data?.t === 'done') {
          if (data.status === 'failed' || data.status === 'aborted') {
            finalizeStream('error', data.error || 'تم إيقاف التوليد أو فشل الاتصال بالنموذج');
          } else {
            finalizeStream('complete');
          }
        }
      };

      eventSource.onmessage = (e) => {
        try {
          handleStreamPayload(JSON.parse(e.data));
        } catch (err) {
          console.warn('SSE parse error:', err);
        }
      };

      // Critical: the server terminates generation with `event: done` (a named SSE
      // event). Without this listener the stream never completes, the UI stays stuck
      // in "generating" and EventSource enters an infinite reconnect loop that
      // exhausts the rate limiter — which is why local model replies appeared stuck.
      eventSource.addEventListener('done', (e: any) => {
        try {
          handleStreamPayload(JSON.parse(e.data));
        } catch (err) {
          console.warn('SSE done event parse error:', err);
          finalizeStream('error', 'استجابة تدفق غير صالحة من الخادم');
        }
      });

      eventSource.onerror = () => {
        // If the server already sent "done", this is just the connection closing.
        if (streamDone) return;
        // Otherwise the stream dropped mid-generation (network/proxy/rate-limit).
        // Keep whatever text arrived, mark complete and stop the reconnect loop.
        console.warn('SSE connection error for task:', taskId);
        finalizeStream('complete');
      };

      // Expose the live stream so handleStopGeneration can sever it instantly.
      activeStreamRef.current = { eventSource, finalize: finalizeStream };

    } catch (err: any) {
      console.error('Send error:', err);
      activeJobRef.current = null;
      setIsGenerating(false);
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m =>
              m.id === assistantMsgId
                ? { ...m, status: 'error', errorDetails: err.message || 'حدث خطأ أثناء الاتصال' }
                : m
            )
          };
        }
        return c;
      }));
    }
  };

  // ==========================================
  // Arena Mode: same prompt → two models → side-by-side with TTFT/speed stats
  // ==========================================
  const arenaTierLabel = (tier: string) => {
    const map: Record<string, string> = { mini: 'MijlAi Mini', flash: 'MijlAi Flash', pro: 'MijlAi Pro', coder: 'MijlAi Coder' };
    if (map[tier]) return map[tier];
    if (tier.startsWith('local:')) return localModels.find(m => m.id === tier)?.name || 'نموذج محلي';
    return tier;
  };

  const handleArenaSend = async () => {
    const textToSend = input.trim();
    if (!textToSend || isGenerating) return;
    if (arenaModelA === arenaModelB) {
      toast.info('اختر نموذجين مختلفين للمقارنة العادلة');
      return;
    }

    let targetChatId = activeChatId;
    if (!targetChatId) {
      const newSession: ChatSession = {
        id: `chat-${Date.now()}`,
        title: generateTitleFromMessage(textToSend),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        modelId: 'arena',
        providerId: 'arena'
      };
      setChats(prev => [newSession, ...prev]);
      targetChatId = newSession.id;
      setActiveChatId(newSession.id);
    }

    const history = buildHistory(activeChat?.messages || []);
    const groupId = `arena-${Date.now()}`;
    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: textToSend, timestamp: Date.now() };
    const leftId = `msg-${Date.now() + 1}`;
    const rightId = `msg-${Date.now() + 2}`;
    const leftMsg: ChatMessage = {
      id: leftId, role: 'assistant', content: '', timestamp: Date.now() + 1,
      modelId: getModelIdForTier(arenaModelA), providerId: 'arena', status: 'streaming',
      arenaGroup: groupId, arenaLabel: arenaTierLabel(arenaModelA), arenaStats: {}, arenaVote: null
    };
    const rightMsg: ChatMessage = {
      id: rightId, role: 'assistant', content: '', timestamp: Date.now() + 2,
      modelId: getModelIdForTier(arenaModelB), providerId: 'arena', status: 'streaming',
      arenaGroup: groupId, arenaLabel: arenaTierLabel(arenaModelB), arenaStats: {}, arenaVote: null
    };

    setChats(prev => prev.map(c => c.id === targetChatId ? {
      ...c,
      title: c.messages.length === 0 ? generateTitleFromMessage(textToSend) : c.title,
      messages: [...c.messages, userMsg, leftMsg, rightMsg],
      updatedAt: Date.now()
    } : c));

    triggerHaptic('light');
    setInput('');
    setAttachments([]);
    setIsGenerating(true);
    setTimeout(() => scrollToBottom(true), 50);

    const styleInstructions = [settings.systemPrompt?.trim(), getGemPrompt(activeGemId)].filter(Boolean).join('\n\n');

    // Stream one arena side: POST /send → EventSource → patch its own message.
    const streamSide = async (tier: string, msgId: string) => {
      const startedAt = performance.now();
      let firstTokenAt = 0;
      let fullText = '';
      let done = false;

      const patchMsg = (patch: Partial<ChatMessage>) => {
        setChats(prev => prev.map(c => c.id !== targetChatId ? c : {
          ...c,
          messages: c.messages.map(m => m.id === msgId ? { ...m, ...patch } : m)
        }));
      };

      // Frame-locked commits per arena side — two parallel streams would
      // otherwise double the React update rate during generation.
      const sideBatcher = createStreamBatcher(() => patchMsg({ content: fullText }));

      const finalize = (status: 'complete' | 'error', errorDetails?: string) => {
        if (done) return;
        done = true;
        sideBatcher.flushNow(); // paint buffered tokens before stats/status settle
        const totalMs = performance.now() - startedAt;
        patchMsg({
          status: status === 'error' ? 'error' : 'complete',
          errorDetails,
          arenaStats: {
            ttftMs: firstTokenAt ? Math.round(firstTokenAt - startedAt) : undefined,
            totalMs: Math.round(totalMs),
            charsPerSec: totalMs > 0 && fullText.length > 0 ? Math.round((fullText.length / totalMs) * 1000) : 0
          }
        });
      };

      try {
        const sendRes = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: textToSend,
            messages: [...history, { role: 'user', content: textToSend }],
            chat_id: targetChatId,
            model: getModelIdForTier(tier),
            user_id: currentUser?.id || 'guest',
            email: currentUser?.email || 'guest@mijlai.com',
            ...(styleInstructions ? { system_prompt: styleInstructions } : {})
          })
        });
        if (!sendRes.ok) throw new Error(`HTTP ${sendRes.status}`);
        const sendData = JSON.parse(await sendRes.text());
        const taskId = sendData.task_id;
        if (!taskId) throw new Error('no task_id');

        const es = new EventSource(`/api/chat/stream/${encodeURIComponent(taskId)}?offset=0`);
        arenaStreamsRef.current.push(es);

        const onPayload = (data: any) => {
          if (data?.t === 'token' && data.d) {
            if (!firstTokenAt) firstTokenAt = performance.now();
            fullText += data.d;
            sideBatcher.schedule();
          } else if (data?.t === 'done') {
            es.close();
            finalize(data.status === 'failed' ? 'error' : 'complete', data.error || undefined);
          }
        };
        es.onmessage = (e) => { try { onPayload(JSON.parse(e.data)); } catch { /* ignore */ } };
        es.addEventListener('done', (e: any) => {
          try { onPayload(JSON.parse(e.data)); } catch { es.close(); finalize('complete'); }
        });
        es.onerror = () => { es.close(); finalize(fullText ? 'complete' : 'error', fullText ? undefined : 'انقطع الاتصال بالنموذج'); };
      } catch (err: any) {
        finalize('error', err?.message || 'فشل الاتصال');
      }
    };

    await Promise.allSettled([streamSide(arenaModelA, leftId), streamSide(arenaModelB, rightId)]);
    arenaStreamsRef.current = [];
    setIsGenerating(false);
    triggerHaptic('medium');
  };

  const handleArenaVote = (groupId: string, vote: 'left' | 'right' | 'tie') => {
    setChats(prev => prev.map(c => ({
      ...c,
      messages: c.messages.map(m => m.arenaGroup === groupId ? { ...m, arenaVote: vote } : m)
    })));
    toast.success('تم تسجيل تقييمك للجولة ⚖️');
  };

  const handleStopGeneration = () => {
    const jobId = activeJobRef.current;
    const chatId = activeChatId;
    // 1) Sever the SSE stream immediately and keep the partial answer.
    activeStreamRef.current?.finalize('complete');
    activeStreamRef.current = null;
    // Arena mode: sever every live side-stream (each side finalizes itself via onerror).
    arenaStreamsRef.current.forEach((es) => { try { es.close(); } catch { /* noop */ } });
    arenaStreamsRef.current = [];
    // Any message still marked streaming (arena sides without a finalize callback
    // reaching them) is settled with whatever partial text it has.
    setChats(prev => prev.map(c => ({
      ...c,
      messages: c.messages.map(m =>
        m.status === 'streaming' || m.status === 'thinking'
          ? { ...m, status: 'complete' }
          : m)
    })));
    setIsGenerating(false);
    if (jobId) {
      // 2) True server-side abort: cancels the upstream generation task so
      // provider quota and server resources stop being consumed right away.
      fetch('/api/chat/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, chatId })
      }).catch(() => {});
    }
    activeJobRef.current = null;
    // الإيقاف اليدوي يلغي الطابور أيضاً: العناصر المنتظرة تُعلَّم كملغاة وتُزال من الطابور
    setMessageQueue(prev => {
      if (prev.length > 0) {
        const queuedAssistantIds = new Set(prev.map(q => q.assistantMsgId));
        setChats(prevChats => prevChats.map(c => ({
          ...c,
          messages: c.messages.map(m =>
            queuedAssistantIds.has(m.id) && m.status === 'queued'
              ? { ...m, status: 'error' as const, errorDetails: 'أُلغيت من الطابور' }
              : m)
        })));
        toast.info('تم مسح طابور الرسائل المنتظرة');
      }
      return [];
    });
  };

  // ── معالج الطابور: عند انتهاء التوليد ووجود رسائل منتظرة، أرسل التالية تلقائياً ──
  useEffect(() => {
    if (isGenerating || messageQueue.length === 0) return;
    const [next, ...rest] = messageQueue;
    setMessageQueue(rest);
    const timer = setTimeout(() => {
      void handleSendMessage(next.text, {
        reuseIds: { chatId: next.chatId, userMsgId: next.userMsgId, assistantMsgId: next.assistantMsgId }
      });
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, messageQueue]);

  // ── المهارات والإضافات: تفعيل/إجراء ──
  const refreshSkillsRegistry = () => setSkillsRegistry(getFullRegistry());

  const handleToggleSkill = (id: string) => {
    const item = skillsRegistry.find(s => s.id === id);
    if (!item) return;
    setSkillEnabled(id, !item.enabled);
    refreshSkillsRegistry();
  };

  const handlePluginAction = (action: string) => {
    switch (action) {
      case 'web_search':
        setWebSearchEnabled(v => !v);
        toast.info(!webSearchEnabled ? 'بحث الويب المباشر مُفعّل — ستُدمج النتائج في الرد' : 'بحث الويب مُعطّل');
        break;
      case 'image_gen':
        if (input.trim()) {
          handleGenerateImage(input.trim());
        } else {
          setInput('توليد صورة: ');
          toast.info('اكتب وصف الصورة التي تريدها ثم أرسلها');
          document.getElementById('main_input')?.focus();
        }
        break;
      case 'tts':
        toast.info('القراءة الصوتية متاحة عبر زر التشغيل على أي رد مكتمل');
        break;
      default:
        // أدوات MCP (fetch/filesystem/memory): تتطلب حساباً وتُستدعى تلقائياً من النموذج
        toast.info('أداة MCP جاهزة — تُستدعى تلقائياً عند الحاجة (تتطلب تسجيل الدخول)');
    }
  };

  const skillsBarElement = (
    <SkillsBar
      registry={skillsRegistry}
      onToggleSkill={handleToggleSkill}
      onTriggerPlugin={handlePluginAction}
      onOpenManager={() => setIsSkillsManagerOpen(true)}
    />
  );

  // Regenerate: remove the previous answer (and anything after it) and re-ask
  // the same question with the conversation context that preceded it.
  const handleRegenerate = () => {
    if (!activeChat || isGenerating) return;
    const msgs = activeChat.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const lastUserMsg = msgs[lastUserIdx];
    const history = buildHistory(msgs.slice(0, lastUserIdx));

    setChats(prev => prev.map(c => (c.id === activeChat.id ? { ...c, messages: msgs.slice(0, lastUserIdx) } : c)));
    handleSendMessage(lastUserMsg.content, { history });
  };

  // Edit a previous user message: truncate the conversation at that message and
  // resend the edited text (regenerates the answer from that point).
  const handleEditUserMessage = (messageId: string, newText: string) => {
    if (!activeChat || isGenerating || !newText.trim()) return;
    const idx = activeChat.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const history = buildHistory(activeChat.messages.slice(0, idx));

    setChats(prev => prev.map(c => (c.id === activeChat.id ? { ...c, messages: activeChat.messages.slice(0, idx) } : c)));
    handleSendMessage(newText, { history });
  };

  // Export the active chat as a Markdown file
  const handleExportChat = () => {
    if (!activeChat || activeChat.messages.length === 0) {
      toast.info('لا توجد رسائل لتصديرها بعد');
      return;
    }
    const lines: string[] = [
      `# ${activeChat.title || 'محادثة MijlAi'}`,
      '',
      `> تم التصدير: ${new Date().toLocaleString('ar')} · ${activeChat.messages.length} رسالة`,
      ''
    ];
    for (const m of activeChat.messages) {
      const who = m.role === 'user' ? '👤 **أنت**' : '✦ **MijlAi**';
      const time = new Date(m.timestamp).toLocaleString('ar');
      lines.push(`### ${who} — ${time}`, '');
      if (m.attachments?.length) {
        for (const a of m.attachments) {
          lines.push(a.mime.startsWith('image/') ? `![${a.name}](${a.url})` : `- 📎 [${a.name}](${a.url})`);
        }
        lines.push('');
      }
      lines.push(m.content.trim() || '_—_');
      if (m.thinking) lines.push('', '<details><summary>🧠 سلسلة التفكير</summary>', '', m.thinking, '', '</details>');
      lines.push('', '---', '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MijlAi_${activeChat.title.slice(0, 30).replace(/[\\/:*?"<>|]/g, '_') || 'chat'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('تم تصدير المحادثة بصيغة Markdown');
  };

  // Attachment handler — real upload to /api/files/upload, chip shown in composer
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const TEXTLIKE_RE = /\.(txt|md|json|csv|py|js|ts|html?|css|xml|ya?ml|log)$/i;

  const handleAttachFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 8MB');
      return;
    }
    setIsUploading(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const result = String(fr.result || '');
          resolve(result.slice(result.indexOf(',') + 1));
        };
        fr.onerror = () => reject(new Error('فشل قراءة الملف'));
        fr.readAsDataURL(file);
      });
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream', data: b64 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الرفع');

      // For documents (non-images): extract the text so the model can actually
      // READ the attachment. Texty files are read locally; PDFs go through the
      // server-side extractor (pypdf).
      let textContent: string | undefined;
      if (!data.mime.startsWith('image/')) {
        try {
          if (TEXTLIKE_RE.test(data.name) || data.mime.startsWith('text/')) {
            textContent = (await file.text()).slice(0, 120000);
          } else if (data.name.toLowerCase().endsWith('.pdf') || data.mime === 'application/pdf') {
            // The stored filename (id + sanitized ext) is the last URL segment.
            const storedName = String(data.url || '').split('/').pop() || '';
            const extRes = await fetch('/api/files/extract-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId: storedName })
            });
            if (extRes.ok) {
              const extData = await extRes.json();
              textContent = String(extData.text || '').slice(0, 120000);
            }
          }
        } catch (extractErr) {
          console.warn('Text extraction failed (file attached without content):', extractErr);
        }
      }

      setAttachments(prev => [...prev, { id: data.id, name: data.name, url: data.url, mime: data.mime, size: data.size, textContent }]);
      toast.success(
        textContent
          ? `تم رفع «${data.name}» وقراءة محتواه (${Math.round(textContent.length / 1000)} ألف حرف)`
          : `تم رفع «${data.name}»`
      );
    } catch (err: any) {
      toast.error(err.message || 'فشل رفع الملف');
    } finally {
      setIsUploading(false);
    }
  };

  // Image Generation with Pollinations.ai
  const handleGenerateImage = async (prompt: string) => {
    if (!prompt.trim()) return;
    
    let targetChatId = activeChatId;

    if (!targetChatId) {
      const newSession: ChatSession = {
        id: `chat-${Date.now()}`,
        title: `توليد صورة: ${prompt.slice(0, 30)}...`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        modelId: 'pollinations-flux',
        providerId: 'pollinations'
      };
      setChats(prev => [newSession, ...prev]);
      targetChatId = newSession.id;
      setActiveChatId(newSession.id);
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `🎨 توليد صورة: ${prompt.trim()}`,
      timestamp: Date.now()
    };

    const assistantMsgId = `msg-${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      modelId: 'pollinations-flux',
      providerId: 'pollinations',
      status: 'streaming',
      isImage: true
    };

    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        const updatedMsgs = [...c.messages, userMsg, assistantMsg];
        return { ...c, messages: updatedMsgs, updatedAt: Date.now() };
      }
      return c;
    }));

    triggerHaptic('light');
    setIsGenerating(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      if (!res.ok) {
        throw new Error(`فشل توليد الصورة (${res.status})`);
      }

      const data = await res.json();
      
      if (data.success && data.url) {
        // Show the generated image
        const imageMarkdown = `![Generated Image](${data.url})\n\n**المُحفِّز:** ${data.prompt}\n**النموذج:** ${data.model} • **الأبعاد:** ${data.width}x${data.height}\n**البذرة:** ${data.seed}`;

        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId ? { ...m, content: imageMarkdown, status: 'complete', isImage: true } : m
              )
            };
          }
          return c;
        }));

        // Also open canvas with the image
        setCanvasContent(imageMarkdown);
        setIsCanvasOpen(true);

        triggerHaptic('medium');
        toast.success('تم توليد الصورة بنجاح');
      } else {
        throw new Error('استجابة غير صالحة من خدمة توليد الصور');
      }
      setIsGenerating(false);
    } catch (err: any) {
      console.error('Image generation error:', err);
      setIsGenerating(false);
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m =>
              m.id === assistantMsgId
                ? { ...m, status: 'error', errorDetails: err.message || 'حدث خطأ أثناء توليد الصورة' }
                : m
            )
          };
        }
        return c;
      }));
    }
  };

  const handleDeleteChat = (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }
  };

  const handleTogglePin = (id: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportBackup = () => {
    fileInputRef.current?.click();
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = importBackup(text);
      setChats(data.chats);
      if (data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings, activeProviderId: 'g4f', activeModelId: data.settings.activeModelId || 'gemini' }));
      }
      toast.success(`تم استيراد النسخة الاحتياطية بنجاح (${data.chats.length} محادثة).`);
    } catch (err: any) {
      toast.error(`فشل استيراد النسخة الاحتياطية: ${err.message || 'صيغة غير صالحة'}`);
    }
  };

  return (
    <div className="w-full h-screen flex bg-white overflow-hidden antialiased selection:bg-blue-100 font-sans">
      <NetworkStatusBanner isOnline={isOnline} />

      {!isUnlocked && (
        <PasswordGateModal
          onUnlock={async (pass) => {
            if (settings.passwordHash && safeEqual(await hashPassword(pass), settings.passwordHash)) {
              setIsUnlocked(true);
              return true;
            }
            return false;
          }}
        />
      )}

      {/* 1. Primary Left Sidebar & Navigation Strip (hidden in Focus Mode) */}
      {!focusMode && (
        <MijlaiSidebar
          isOpen={isSidebarOpen}
          onCloseSidebar={closeSidebar}
          isHistoryOpen={isHistoryOpen}
          onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
          onNewChat={handleNewChat}
          onOpenCanvas={() => setIsCanvasOpen(!isCanvasOpen)}
          onOpenFiles={() => setIsFilesOpen(true)}
          onOpenGems={() => setIsGemsOpen(true)}
          onOpenImageStudio={() => { setIsImageStudioOpen(true); closeSidebar(); }}
          onOpenUpgrade={() => setIsUpgradeOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenAdminPanel={() => setIsAdminModalOpen(true)}
          currentUser={currentUser}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={(id) => {
            setActiveChatId(id);
            closeSidebar();
          }}
          onDeleteChat={handleDeleteChat}
          onTogglePin={handleTogglePin}
          userName={userName}
        />
      )}

{/* 2. Main Content Canvas */}
      <main
        className="w-full h-full relative flex flex-col min-w-0"
        style={{
          background: 'var(--app-bg)'
        }}
      >
        {!focusMode && (
          <MijlaiHeader
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(v => !v)}
            onOpenEditPrompt={() => setIsPromptEditOpen(true)}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onNewChat={handleNewChat}
            onExportChat={handleExportChat}
            currentUser={currentUser}
          />
        )}

        {/* Focus Mode toggle button (visible when header is shown) */}
        {!focusMode && (
          <button
            onClick={() => { setFocusMode(true); setIsSidebarOpen(false); }}
            className="absolute bottom-4 left-4 md:bottom-auto md:top-4 md:right-24 z-20 h-8 w-8 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-blue-600 border border-slate-200/80 shadow-2xs hover:shadow-md flex items-center justify-center transition-all backdrop-blur-md"
            title="وضع التركيز الخالي من المشتتات (Ctrl+Shift+F)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Focus Mode floating toolbar (exit + toggle) */}
        {focusMode && (
          <button
            onClick={() => setFocusMode(false)}
            className="absolute top-4 left-4 z-30 h-9 px-3 rounded-full bg-white/90 border border-slate-200 shadow-md flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 transition-all backdrop-blur-md"
            title="الخروج من وضع التركيز (Esc أو Ctrl+Shift+F)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">خروج من التركيز</span>
          </button>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 w-full overflow-hidden">
          {activeChat && activeChat.messages.length > 0 ? (
            <div
              ref={chatContainerRef}
              onScroll={handleScroll}
              className="w-full max-w-[850px] h-full overflow-y-auto py-16 px-3 sm:px-5 space-y-5 scroll-smooth"
            >
              {activeChat.messages.map((msg, index) => {
                // Arena pairs render side-by-side (the second member is folded in)
                if (msg.arenaGroup && activeChat.messages[index - 1]?.arenaGroup === msg.arenaGroup) {
                  return null;
                }
                if (msg.arenaGroup && activeChat.messages[index + 1]?.arenaGroup === msg.arenaGroup) {
                  return (
                    <ArenaPairView
                      key={msg.arenaGroup}
                      left={msg}
                      right={activeChat.messages[index + 1]}
                      onVote={handleArenaVote}
                    />
                  );
                }
                return (
                  <ChatMessageItem
                    key={msg.id}
                    message={msg}
                    isLastAssistantMessage={
                      msg.role === 'assistant' && index === activeChat.messages.length - 1
                    }
                    onRegenerate={handleRegenerate}
                    onEditPrompt={handleEditUserMessage}
                    onOpenCanvas={handleOpenCanvasArtifact}
                  />
                );
              })}

              {/* Follow-up suggestion chips — keep the conversation flowing */}
              {(() => {
                const lastMsg = activeChat.messages[activeChat.messages.length - 1];
                if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.status !== 'complete' || isGenerating) return null;
                const chips = lastMsg.followUps || [];
                if (chips.length === 0) return null;
                return (
                  <div className="w-full flex flex-col items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> تابع الحوار
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {chips.map((chip, i) => (
                        <button
                          key={`${chip}-${i}`}
                          onClick={() => handleSendMessage(chip)}
                          className="px-3.5 py-2 rounded-2xl text-[12px] font-medium bg-white/80 hover:bg-white border border-slate-200/80 hover:border-blue-300 text-slate-600 hover:text-blue-700 shadow-sm hover:shadow transition-all active:scale-[0.97]"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Empty State Greeting */
            <div className="flex-1 flex flex-col items-center justify-center w-full px-4">
              <div className="mb-[20px] md:mb-[28px] flex flex-col items-center cursor-pointer transition-transform hover:scale-[1.01]" onClick={() => setSelectedTier('flash')}>
                <MijlaiLogo size="hero" />
              </div>

              {/* Quick-start prompt chips — lower the "blank page" barrier */}
              <div className="w-full max-w-[760px] md:w-[75%] mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STARTER_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(p.text);
                        // Focus the composer so the user can tweak the prompt immediately
                        requestAnimationFrame(() => {
                          const el = document.getElementById('main_input') as HTMLTextAreaElement | null;
                          el?.focus();
                          if (el) el.setSelectionRange(el.value.length, el.value.length);
                        });
                      }}
                      className="group flex items-start gap-2.5 text-right p-3 bg-white/70 hover:bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md text-xs text-slate-600 hover:text-slate-900"
                    >
                      <span className="shrink-0 w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="leading-relaxed line-clamp-2">{p.text}</span>
                    </button>
                  );
                })}
              </div>

              <MijlaiComposer
                input={input}
                setInput={setInput}
                onSend={() => handleSendMessage()}
                onStop={handleStopGeneration}
                isGenerating={isGenerating}
                selectedTier={selectedTier}
                onSelectTier={setSelectedTier}
                webSearchEnabled={webSearchEnabled}
                setWebSearchEnabled={setWebSearchEnabled}
                knowledgeEnabled={knowledgeEnabled}
                setKnowledgeEnabled={setKnowledgeEnabled}
                localModels={localModels}
                onGenerateImage={handleGenerateImage}
                onAttachFile={handleAttachFile}
                attachments={attachments}
                onRemoveAttachment={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
                isUploading={isUploading}
                arenaMode={arenaMode}
                onToggleArena={() => setArenaMode(v => !v)}
                arenaModelA={arenaModelA}
                arenaModelB={arenaModelB}
                onSelectArenaModel={(side, tier) => side === 'a' ? setArenaModelA(tier) : setArenaModelB(tier)}
                skillsBar={skillsBarElement}
                queueCount={messageQueue.length}
              />
            </div>
          )}

          {/* Active Gem persona indicator — one click to clear */}
          {activeGemId && (
            <div className="w-full flex justify-center px-4 pt-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full bg-purple-600/10 text-purple-700 border border-purple-500/30">
                <span>✦ شخصية نشطة: {GEMS.find(g => g.id === activeGemId)?.title}</span>
                <button
                  onClick={() => setActiveGemId(null)}
                  aria-label="إلغاء الشخصية"
                  className="hover:text-purple-900 transition-colors"
                >
                  ✕
                </button>
              </span>
            </div>
          )}

          {activeChat && activeChat.messages.length > 0 && (
            <div className="w-full pb-safe pt-2">
              <MijlaiComposer
                input={input}
                setInput={setInput}
                onSend={() => handleSendMessage()}
                onStop={handleStopGeneration}
                isGenerating={isGenerating}
                selectedTier={selectedTier}
                onSelectTier={setSelectedTier}
                webSearchEnabled={webSearchEnabled}
                setWebSearchEnabled={setWebSearchEnabled}
                knowledgeEnabled={knowledgeEnabled}
                setKnowledgeEnabled={setKnowledgeEnabled}
                localModels={localModels}
                onGenerateImage={handleGenerateImage}
                onAttachFile={handleAttachFile}
                attachments={attachments}
                onRemoveAttachment={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
                isUploading={isUploading}
                arenaMode={arenaMode}
                onToggleArena={() => setArenaMode(v => !v)}
                arenaModelA={arenaModelA}
                arenaModelB={arenaModelB}
                onSelectArenaModel={(side, tier) => side === 'a' ? setArenaModelA(tier) : setArenaModelB(tier)}
                skillsBar={skillsBarElement}
                queueCount={messageQueue.length}
              />
            </div>
          )}
        </div>

        {showScrollToBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 left-6 p-2.5 bg-blue-600 text-white rounded-full shadow-lg transition-all z-20 hover:bg-blue-700"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </main>

      <CanvasPanel
        isOpen={isCanvasOpen}
        onClose={() => setIsCanvasOpen(false)}
        content={canvasContent}
        kind={canvasKind}
        onChangeContent={(v) => { setCanvasContent(v); setCanvasKind(undefined); }}
      />

      <SkillsManagerModal
        isOpen={isSkillsManagerOpen}
        onClose={() => setIsSkillsManagerOpen(false)}
        registry={skillsRegistry}
        onToggleSkill={handleToggleSkill}
        onRegistryChanged={refreshSkillsRegistry}
      />
      {/* ترحيب أول مرة — بعد تجاوز بوابة القفل */}
      <OnboardingModal
        isOpen={isUnlocked && showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
      <FilesModal isOpen={isFilesOpen} onClose={() => setIsFilesOpen(false)} />
      <GemsModal isOpen={isGemsOpen} onClose={() => setIsGemsOpen(false)} onSelectGem={setActiveGemId} activeGemId={activeGemId} />
      <ImageStudio isOpen={isImageStudioOpen} onClose={() => setIsImageStudioOpen(false)} />
      <UpgradeModal isOpen={isUpgradeOpen} onClose={() => setIsUpgradeOpen(false)} />
      <PromptEditModal
        isOpen={isPromptEditOpen}
        onClose={() => setIsPromptEditOpen(false)}
        customPrompt={settings.systemPrompt}
        onSavePrompt={(p) => setSettings(prev => ({ ...prev, systemPrompt: p }))}
      />
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userName={userName}
        onChangeName={setUserName}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        providers={APP_CONFIG.defaultProviders}
        onAddCustomProvider={(prov) => {
          setSettings(prev => ({ ...prev, customProviders: [...prev.customProviders, prov] }));
        }}
        onDeleteCustomProvider={(id) => {
          setSettings(prev => ({ ...prev, customProviders: prev.customProviders.filter(p => p.id !== id) }));
        }}
        onExportBackup={() => exportBackup(chats, settings)}
        onImportBackup={handleImportBackup}
        onClearData={() => setChats([])}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportBackupFile}
      />

      {/* Auth Modal (Open WebUI Login / Register) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setUserName(user.username);
          // Persist the JWT so authenticated calls (admin panel) survive reloads
          const token = (user as any).token;
          if (token) {
            setSettings(prev => ({ ...prev, userAuthToken: token }));
            localStorage.setItem('mijlai_auth_token', token);
          }
        }}
      />

      {/* Admin Control Panel & Monitoring Dashboard */}
      <AdminControlPanelModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        currentUser={currentUser}
      />

      {/* Cmd/Ctrl+K command palette */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        chats={chats}
        onSelectChat={(id) => { setActiveChatId(id); }}
        actions={[
          { id: 'new-chat', title: 'محادثة جديدة', hint: 'Ctrl+Shift+O', icon: <SquarePen className="w-4 h-4" />, run: handleNewChat },
          { id: 'settings', title: 'فتح الإعدادات', icon: <SettingsIcon className="w-4 h-4" />, run: () => setIsSettingsOpen(true) },
          { id: 'files', title: 'قاعدة المعرفة (مستنداتي)', icon: <FolderIcon className="w-4 h-4" />, run: () => setIsFilesOpen(true) },
          { id: 'gems', title: 'شخصيات MijlAi (Gems)', icon: <LayoutGridIcon className="w-4 h-4" />, run: () => setIsGemsOpen(true) },
          { id: 'focus', title: focusMode ? 'إنهاء وضع التركيز' : 'وضع التركيز', hint: 'Ctrl+Shift+F', icon: <Maximize2 className="w-4 h-4" />, run: () => { if (!focusMode) setIsSidebarOpen(false); setFocusMode(f => !f); } },
          { id: 'export', title: 'تصدير المحادثة الحالية (Markdown)', icon: <Download className="w-4 h-4" />, run: handleExportChat },
          { id: 'toggle-theme', title: 'تبديل المظهر (فاتح/داكن)', icon: <Moon className="w-4 h-4" />, run: () => { const next = isDarkTheme(settings.theme) ? 'light' : 'dark'; setSettings(prev => ({ ...prev, theme: next })); } },
        ]}
      />

      {/* Global non-blocking notifications (replaces alert/confirm/prompt) */}
      <ToastHost />
    </div>
  );
}
