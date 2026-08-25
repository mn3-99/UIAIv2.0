import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowDown, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

import { MijlaiSidebar } from './components/MijlaiSidebar';
import { MijlaiHeader } from './components/MijlaiHeader';
import { MijlaiComposer } from './components/MijlaiComposer';
import { MijlaiLogo } from './components/MijlaiLogo';
import { ChatMessageItem } from './components/ChatMessageItem';
import { CanvasPanel } from './components/CanvasPanel';
import { SettingsModal } from './components/SettingsModal';
import { PasswordGateModal } from './components/PasswordGateModal';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import {
  FilesModal, GemsModal, UpgradeModal, PromptEditModal, ProfileModal
} from './components/MijlaiModals';
import { AuthModal } from './components/AuthModal';
import { AdminControlPanelModal } from './components/AdminControlPanelModal';

import { ChatSession, ChatMessage, AppSettings, UserAccount } from './types';
import { APP_CONFIG } from './config';
import {
  loadSettings, saveSettings, loadChats, saveChats,
  exportBackup, importBackup, generateTitleFromMessage, hashPassword, safeEqual
} from './utils/storage';
import { connectionManager, ConnectionStatus } from './utils/connectionManager';
import { registerServiceWorker } from './swRegister';
import { triggerHaptic, setupVisualViewportKeyboard, saveMessageLocally } from './utils/nativeAdapter';
import { Image, MessageSquare } from 'lucide-react';

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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // Sidebar overlay state — hidden by default; the chat area fills the whole screen.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [canvasContent, setCanvasContent] = useState('');

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isGemsOpen, setIsGemsOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isPromptEditOpen, setIsPromptEditOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // User Auth & Web Search Grounding state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>({
    id: 'admin_1',
    username: 'Mhmod',
    email: 'admin@mijlai.com',
    role: 'admin',
    status: 'active'
  });
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Models state
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string; icon?: string; is_free?: boolean}>>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  const [isUnlocked, setIsUnlocked] = useState(!settings.passwordProtected);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(connectionManager.getStatus());
  const [isOnline, setIsOnline] = useState(connectionManager.isOnline());

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Tracks the currently active background job so Stop can abort it server-side
  const activeJobRef = useRef<string | null>(null);

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
    'aria': 'kimi'
  };

  // Apply the saved theme on mount (body[data-theme] drives the CSS variables)
  useEffect(() => {
    if (settings.theme) {
      document.body.setAttribute('data-theme', settings.theme);
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

  // Save chats & settings to localStorage
  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

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

  // Send Prompt with Decoupled Zero-Latency Engine
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || isGenerating) return;

    let targetChatId = activeChatId;

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

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now()
    };

    const assistantMsgId = `msg-${Date.now() + 1}`;

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      modelId: getModelIdForTier(selectedTier),
      providerId: 'g4f',
      status: 'streaming'
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

    triggerHaptic('light');
    setInput('');
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

      // Decoupled Send request to FastAPI / Proxy (<10ms TTFB)
      const sendRes = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          chat_id: targetChatId,
          model: getModelIdForTier(selectedTier),
          user_id: currentUser?.id || 'guest',
          email: currentUser?.email || 'guest@mijlai.com'
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

      // Shared finalizer: marks the assistant message complete or failed exactly once,
      // closes the stream and clears the generating state (prevents reconnect/rate-limit loops).
      const finalizeStream = (status: 'complete' | 'error', errorDetails?: string) => {
        if (streamDone) return;
        streamDone = true;
        eventSource.close();
        activeJobRef.current = null;
        setIsGenerating(false);
        if (status === 'complete') triggerHaptic('medium');
        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId
                  ? { ...m, status: status === 'error' ? 'error' : 'complete', errorDetails }
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
          setChats(prev => prev.map(c => {
            if (c.id !== targetChatId) return c;
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id !== assistantMsgId) return m;
                const nextThinking = data.full ? incoming : ((m.thinking || '') + incoming);
                return { ...m, thinking: nextThinking };
              })
            };
          }));
        } else if (data?.t === 'token' && data.d) {
          fullText += data.d;

          // Freeze thinking duration on the first answer token
          setChats(prev => prev.map(c => {
            if (c.id !== targetChatId) return c;
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id !== assistantMsgId) return m;
                const patch: Partial<ChatMessage> = { content: fullText };
                if (m.thinking && !m.thinkingDurationMs) patch.thinkingDurationMs = Date.now() - (thinkStartRef.current || Date.now());
                return { ...m, ...patch } as ChatMessage;
              })
            };
          }));

          if (chatContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
            if (scrollHeight - scrollTop - clientHeight < 150) {
              scrollToBottom(false);
            }
          }
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

  const handleStopGeneration = () => {
    const jobId = activeJobRef.current;
    setIsGenerating(false);
    if (jobId) {
      // Best-effort abort of the background worker on the server
      fetch('/api/chat/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      }).catch(() => {});
    }
    activeJobRef.current = null;
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
      } else {
        throw new Error('استجابة غير صالحة من خدمة توليد الصور');
      }
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
      alert('تم استيراد النسخة الاحتياطية بنجاح.');
    } catch (err: any) {
      alert(`فشل استيراد النسخة الاحتياطية: ${err.message || 'صيغة غير صالحة'}`);
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
          onOpenUpgrade={() => setIsUpgradeOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
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
          background: 'linear-gradient(180deg, #e8f0fe 0%, #f8fbff 38%, #eef6ff 100%)'
        }}
      >
        {!focusMode && (
          <MijlaiHeader
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(v => !v)}
            onOpenEditPrompt={() => setIsPromptEditOpen(true)}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onNewChat={handleNewChat}
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
              className="w-full max-w-[850px] h-full overflow-y-auto py-16 px-3 sm:px-4 space-y-4 scroll-smooth"
            >
              {activeChat.messages.map((msg, index) => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isLastAssistantMessage={
                    msg.role === 'assistant' && index === activeChat.messages.length - 1
                  }
                  onRegenerate={() => {
                    const lastUserMsg = activeChat.messages.filter(m => m.role === 'user').pop();
                    if (lastUserMsg) handleSendMessage(lastUserMsg.content);
                  }}
                  onEditPrompt={(newPrompt) => {
                    handleSendMessage(newPrompt);
                  }}
                />
              ))}
            </div>
          ) : (
            /* Empty State Greeting */
            <div className="flex-1 flex flex-col items-center justify-center w-full px-4">
              <div className="mb-[20px] md:mb-[28px] flex flex-col items-center cursor-pointer transition-transform hover:scale-[1.01]" onClick={() => setSelectedTier('flash')}>
                <MijlaiLogo size="hero" />
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
                localModels={localModels}
                onGenerateImage={handleGenerateImage}
                onAttachFile={(file) => {
                  alert(`تم إرفاق الملف: ${file.name}`);
                }}
              />
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
                localModels={localModels}
                onGenerateImage={handleGenerateImage}
                onAttachFile={(file) => {
                  alert(`تم إرفاق الملف: ${file.name}`);
                }}
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
        onChangeContent={setCanvasContent}
      />

      <FilesModal isOpen={isFilesOpen} onClose={() => setIsFilesOpen(false)} />
      <GemsModal isOpen={isGemsOpen} onClose={() => setIsGemsOpen(false)} />
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
        }}
      />

      {/* Admin Control Panel & Monitoring Dashboard */}
      <AdminControlPanelModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
}
