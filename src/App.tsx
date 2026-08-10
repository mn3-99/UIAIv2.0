import React, { useState, useEffect, useRef } from 'react';
import { ArrowDown } from 'lucide-react';

import { MijlaiSidebar } from './components/MijlaiSidebar';
import { MijlaiHeader } from './components/MijlaiHeader';
import { MijlaiComposer } from './components/MijlaiComposer';
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
  exportBackup, generateTitleFromMessage
} from './utils/storage';
import { connectionManager, ConnectionStatus } from './utils/connectionManager';
import { registerServiceWorker } from './swRegister';
import { triggerHaptic, setupVisualViewportKeyboard, saveMessageLocally } from './utils/nativeAdapter';

export default function App() {
  // Application State
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [chats, setChats] = useState<ChatSession[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Mhmod');

  // Model Tier state: flash, pro, thinking, claude, deepseek, kimi
  const [selectedTier, setSelectedTier] = useState<string>('flash');

  // Input & Streaming State
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
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

  const [isUnlocked, setIsUnlocked] = useState(!settings.passwordProtected);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(connectionManager.getStatus());
  const [isOnline, setIsOnline] = useState(connectionManager.isOnline());

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Register PWA Service Worker & Native Keyboard Listener on app init
  useEffect(() => {
    registerServiceWorker();
    const cleanupKeyboard = setupVisualViewportKeyboard();
    return () => {
      cleanupKeyboard();
    };
  }, []);

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

  // Map model tier to specific backend model ID
  const getModelIdForTier = (tier: string) => {
    switch (tier) {
      case 'flash':
        return 'MijlAI Flash (Gemini 2.5)';
      case 'pro':
        return 'MijlAI Pro (GPT-4o)';
      case 'thinking':
        return 'MijlAI Thinking (o3-mini)';
      case 'claude':
        return 'MijlAI Claude 3.7 Sonnet';
      case 'deepseek':
        return 'MijlAI DeepSeek R1 Reasoning';
      case 'kimi':
        return 'MijlAI Kimi K3 / Moonshot';
      default:
        return 'MijlAI Flash (Gemini 2.5)';
    }
  };

  // Active chat session reference
  const activeChat = chats.find(c => c.id === activeChatId) || null;

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
      // Decoupled Send request to FastAPI / Proxy (<10ms TTFB)
      const sendRes = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend.trim(),
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

      // Open SSE stream with offset resumption
      const eventSource = new EventSource(`/api/chat/stream/${encodeURIComponent(taskId)}?offset=0`);

      let fullText = '';

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.t === 'token' && data.d) {
            fullText += data.d;

            if (fullText.includes('```') && !canvasContent) {
              setCanvasContent(fullText);
            }

            setChats(prev => prev.map(c => {
              if (c.id === targetChatId) {
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMsgId ? { ...m, content: fullText } : m
                  )
                };
              }
              return c;
            }));

            if (chatContainerRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
              if (scrollHeight - scrollTop - clientHeight < 150) {
                scrollToBottom(false);
              }
            }
          } else if (data.t === 'done') {
            eventSource.close();
            setIsGenerating(false);
            triggerHaptic('medium');
            setChats(prev => prev.map(c => {
              if (c.id === targetChatId) {
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMsgId ? { ...m, status: 'complete' } : m
                  )
                };
              }
              return c;
            }));
          }
        } catch (err) {
          console.warn('SSE parse error:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsGenerating(false);
        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId ? { ...m, status: 'complete' } : m
              )
            };
          }
          return c;
        }));
      };

    } catch (err: any) {
      console.error('Send error:', err);
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
    setIsGenerating(false);
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

  return (
    <div className="w-screen h-screen flex bg-white overflow-hidden antialiased selection:bg-blue-100 font-sans">
      <NetworkStatusBanner isOnline={isOnline} />

      {!isUnlocked && (
        <PasswordGateModal
          onUnlock={(pass) => {
            if (settings.passwordHash && btoa(pass) === settings.passwordHash) {
              setIsUnlocked(true);
              return true;
            }
            return false;
          }}
        />
      )}

      {/* 1. Primary Left Sidebar & Navigation Strip */}
      <MijlaiSidebar
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
        onSelectChat={(id) => setActiveChatId(id)}
        onDeleteChat={handleDeleteChat}
        onTogglePin={handleTogglePin}
        userName={userName}
      />

      {/* 2. Main Content Canvas */}
      <main
        className="flex-1 h-full relative flex flex-col transition-all duration-200"
        style={{
          background: 'linear-gradient(180deg, #e8f0fe 0%, #f8fbff 38%, #eef6ff 100%)'
        }}
      >
        <MijlaiHeader
          onOpenEditPrompt={() => setIsPromptEditOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onNewChat={handleNewChat}
          currentUser={currentUser}
        />

        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 w-full overflow-hidden">
          {activeChat && activeChat.messages.length > 0 ? (
            <div
              ref={chatContainerRef}
              onScroll={handleScroll}
              className="w-full max-w-[850px] h-full overflow-y-auto py-16 px-2 space-y-4 scroll-smooth"
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
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              <h1
                className="text-[38px] md:text-[56px] font-extrabold tracking-tight text-slate-800 text-center mb-[28px] md:mb-[36px] select-none"
                style={{ fontFamily: '"Google Sans", "Inter", sans-serif' }}
              >
                MijlAI
              </h1>

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
                onAttachFile={(file) => {
                  alert(`تم إرفاق الملف: ${file.name}`);
                }}
              />
            </div>
          )}

          {activeChat && activeChat.messages.length > 0 && (
            <div className="w-full pb-6 pt-2">
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
        onImportBackup={() => {}}
        onClearData={() => setChats([])}
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
