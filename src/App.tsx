import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowDown, Maximize2, Minimize2, SquarePen, Settings as SettingsIcon, Folder as FolderIcon, LayoutGrid as LayoutGridIcon, Download, Moon, Sparkles, X } from 'lucide-react';

import { MijlaiSidebar } from './components/MijlaiSidebar';
import { MijlaiHeader } from './components/MijlaiHeader';
import { ChatMessageItem } from './components/ChatMessageItem';
import { CanvasPanel, CanvasKind } from './components/CanvasPanel';
import { PasswordGateModal } from './components/PasswordGateModal';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import { ToastHost, toast } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { ArenaPairView } from './components/ArenaPairView';
import { SkillsBar } from './components/SkillsBar';
import { AndroidAppBanner } from './components/AndroidAppBanner';
import { StarterScreen } from './components/StarterScreen';
import { FollowUpChips } from './components/FollowUpChips';
import { ComposerSlot, ComposerUi } from './components/ComposerSlot';
import { ModalHost } from './components/ModalHost';

import { applyTheme, isDarkTheme } from './utils/theme';
import { applyAccent } from './utils/dynamicTheme';
import { withViewTransition } from './utils/viewTransitions';
import { GEMS } from './utils/gems';
import { getFullRegistry, setSkillEnabled, getActivePromptPacks, SkillDefinition } from './utils/skillsRegistry';
import { setupVisualViewportKeyboard } from './utils/nativeAdapter';
import { isOnboardingDone } from './components/OnboardingModal';
import { connectionManager, ConnectionStatus } from './utils/connectionManager';
import { registerServiceWorker } from './swRegister';
import { loadSettings, loadChats, exportBackup, importBackup, hashPassword, safeEqual } from './utils/storage';
import { tierToModelId, modelIdToTier } from './models/tiers';
import { useChatEngine } from './hooks/useChatEngine';
import { useChatPersistence } from './hooks/useChatPersistence';
import { useComposerFocus } from './components/ComposerFocusContext';

import { ChatSession, AppSettings, UserAccount } from './types';
import { APP_CONFIG } from './config';

export default function App() {
  // ── Core state (owned by App, shared with hooks) ──
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [chats, setChats] = useState<ChatSession[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Mhmod');
  const [selectedTier, setSelectedTier] = useState<string>('pwr');
  const [focusMode, setFocusMode] = useState(false);
  const [input, setInput] = useState('');

  // ── UI flags ──
  const [skillsRegistry, setSkillsRegistry] = useState<SkillDefinition[]>(() => getFullRegistry());
  const [isSkillsManagerOpen, setIsSkillsManagerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [canvasContent, setCanvasContent] = useState('');
  const [canvasKind, setCanvasKind] = useState<CanvasKind | undefined>(undefined);
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

  // ── Persona / arena ──
  const [activeGemId, setActiveGemId] = useState<string | null>(null);
  const [arenaMode, setArenaMode] = useState(false);
  const [arenaModelA, setArenaModelA] = useState<string>('flash');
  const [arenaModelB, setArenaModelB] = useState<string>('pro');

  // ── Auth / features ──
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false);

  // ── Models / boot ──
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string; icon?: string; is_free?: boolean }>>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(!settings.passwordProtected);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(connectionManager.getStatus());
  const [isOnline, setIsOnline] = useState(connectionManager.isOnline());
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const localModels = useMemo(
    () => (availableModels || [])
      .filter((m) => m.provider === 'llama')
      .map((m) => ({ id: m.id, name: m.name })),
    [availableModels]
  );

  const { focusComposer } = useComposerFocus();

  // ── Persistence: drafts, localStorage, cloud sync, session restore ──
  useChatPersistence({
    chats, setChats, settings, activeChatId, input, setInput, setCurrentUser, setUserName,
  });

  // ── Scroll helpers (used by the engine + view) ──
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setShowScrollToBottom(scrollHeight - scrollTop - clientHeight >= 100);
  };

  const scrollToBottom = (smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  // Open an artifact (html/svg/mermaid code block) in the live Canvas panel.
  const handleOpenCanvasArtifact = (code: string, language: string) => {
    const lang = (language || '').toLowerCase();
    const kind: CanvasKind = lang === 'svg' || lang === 'xml' ? 'svg' : lang === 'mermaid' ? 'mermaid' : 'html';
    setCanvasContent(code);
    setCanvasKind(kind);
    setIsCanvasOpen(true);
  };

  // ── Chat engine: send/stop/regenerate/edit/arena/queue/attachments ──
  const engine = useChatEngine({
    chats, setChats, activeChatId, setActiveChatId, input, setInput,
    settings, selectedTier, webSearchEnabled, knowledgeEnabled, currentUser,
    activeGemId, localModels, arenaMode, arenaModelA, arenaModelB,
    onArtifact: handleOpenCanvasArtifact,
    onImageGenerated: (markdown) => { setCanvasContent(markdown); setIsCanvasOpen(true); },
    scrollToBottom,
    chatContainerRef,
  });

  // ── Sidebar / chat CRUD ──
  const closeSidebar = () => {
    setIsSidebarOpen(false);
    setIsHistoryOpen(false);
  };

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title: 'محادثة جديدة',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      modelId: tierToModelId(selectedTier),
      providerId: 'g4f'
    };
    setChats(prev => [newSession, ...prev]);
    setActiveChatId(newSession.id);
    setInput('');
    closeSidebar();
  };

  const handleDeleteChat = (id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const handleTogglePin = (id: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  // ── Skills & plugins ──
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
          engine.handleGenerateImage(input.trim());
        } else {
          setInput('توليد صورة: ');
          toast.info('اكتب وصف الصورة التي تريدها ثم أرسلها');
          focusComposer();
        }
        break;
      case 'tts':
        toast.info('القراءة الصوتية متاحة عبر زر التشغيل على أي رد مكتمل');
        break;
      default:
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

  // ── Composer wiring (single bundle → one MijlaiComposer call site) ──
  const composerUi: ComposerUi = {
    input, setInput,
    selectedTier, onSelectTier: setSelectedTier,
    webSearchEnabled, setWebSearchEnabled,
    knowledgeEnabled, setKnowledgeEnabled,
    localModels,
    arenaMode, onToggleArena: () => setArenaMode(v => !v),
    arenaModelA, arenaModelB,
    onSelectArenaModel: (side, tier) => side === 'a' ? setArenaModelA(tier) : setArenaModelB(tier),
    skillsBar: skillsBarElement,
    isGuest: currentUser === null,
  };

  // ── Export chat as Markdown ──
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

  // ── Backup import ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportBackup = () => fileInputRef.current?.click();

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

  // ── Effects ──
  // Load models from API on app init
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) setAvailableModels(data.models);
        }
      } catch (err) {
        console.warn('Failed to load models:', err);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

  // Apply the saved theme
  useEffect(() => {
    if (settings.theme) applyTheme(settings.theme);
  }, [settings.theme]);

  // Apply custom accent (and re-derive when theme flips light/dark)
  useEffect(() => {
    applyAccent(settings.accent || null);
  }, [settings.accent, settings.theme]);

  // Sync selectedTier with settings.activeModelId
  useEffect(() => {
    if (settings.activeModelId) {
      if (settings.activeModelId.startsWith('local:')) {
        setSelectedTier(settings.activeModelId);
      } else if (modelIdToTier(settings.activeModelId)) {
        setSelectedTier(modelIdToTier(settings.activeModelId)!);
      }
    }
  }, [settings.activeModelId]);

  // Guests default to lalo-fast
  useEffect(() => {
    if (currentUser === null && selectedTier !== 'lalo-fast') {
      setSelectedTier('lalo-fast');
    }
  }, [currentUser]);

  // Register PWA Service Worker & Native Keyboard Listener
  useEffect(() => {
    registerServiceWorker();
    const cleanupKeyboard = setupVisualViewportKeyboard();
    return () => { cleanupKeyboard(); };
  }, []);

  // Focus Mode keyboard shortcut + palette (Cmd/Ctrl+K)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((o) => !o);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!focusMode) setIsSidebarOpen(false);
        setFocusMode(f => !f);
      } else if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  // Escape closes the sidebar overlay
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // Accessibility: move focus into/out of the drawer
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

  // ── Follow-up chips (computed once, not per render via IIFE) ──
  const followUpChips = useMemo(() => {
    if (engine.isGenerating || !activeChat) return [];
    const lastMsg = activeChat.messages[activeChat.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.status !== 'complete') return [];
    return lastMsg.followUps || [];
  }, [activeChat?.messages, engine.isGenerating]);

  return (
    <div className="w-full h-dvh flex bg-surface overflow-hidden antialiased selection:bg-accent-soft font-sans">
      <AndroidAppBanner />
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
          onSelectChat={(id) => { setActiveChatId(id); closeSidebar(); }}
          onDeleteChat={handleDeleteChat}
          onTogglePin={handleTogglePin}
          userName={userName}
        />
      )}

      <main className="w-full h-full relative flex flex-col min-w-0" style={{ background: 'var(--app-bg)' }}>
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

        {!focusMode && (
          <button
            onClick={() => { setFocusMode(true); setIsSidebarOpen(false); }}
            className="absolute bottom-4 end-4 md:bottom-auto md:top-4 md:start-24 z-20 h-8 w-8 rounded-full bg-surface/90 hover:bg-surface text-muted hover:text-accent border border-line/80 shadow-2xs hover:shadow-md flex items-center justify-center transition-all backdrop-blur-md"
            title="وضع التركيز الخالي من المشتتات (Ctrl+Shift+F)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {focusMode && (
          <button
            onClick={() => setFocusMode(false)}
            className="absolute top-4 end-4 z-30 h-9 px-3 rounded-full bg-surface/90 border border-line shadow-md flex items-center gap-1.5 text-xs font-semibold text-main hover:text-accent transition-all backdrop-blur-md"
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
                if (msg.arenaGroup && activeChat.messages[index - 1]?.arenaGroup === msg.arenaGroup) return null;
                if (msg.arenaGroup && activeChat.messages[index + 1]?.arenaGroup === msg.arenaGroup) {
                  return (
                    <ArenaPairView
                      key={msg.arenaGroup}
                      left={msg}
                      right={activeChat.messages[index + 1]}
                      onVote={engine.handleArenaVote}
                    />
                  );
                }
                return (
                  <ChatMessageItem
                    key={msg.id}
                    message={msg}
                    isLastAssistantMessage={msg.role === 'assistant' && index === activeChat.messages.length - 1}
                    onRegenerate={engine.handleRegenerate}
                    onEditPrompt={engine.handleEditUserMessage}
                    onOpenCanvas={handleOpenCanvasArtifact}
                    caretMode={settings.caret || 'block'}
                  />
                );
              })}

              <FollowUpChips chips={followUpChips} onPick={(chip) => engine.handleSendMessage(chip)} />
            </div>
          ) : (
            <StarterScreen
              isGuest={currentUser === null}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onLogoClick={() => setSelectedTier('flash')}
              onPickPrompt={(text) => {
                setInput(text);
                requestAnimationFrame(() => focusComposer());
              }}
              composer={<ComposerSlot variant="hero" engine={engine} ui={composerUi} />}
            />
          )}

          {/* Active Gem persona indicator — one click to clear */}
          {activeGemId && (
            <div className="w-full flex justify-center px-4 pt-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full bg-purple-600/10 text-purple-700 border border-purple-500/30">
                <Sparkles className="w-3 h-3" />
                <span>شخصية نشطة: {GEMS.find(g => g.id === activeGemId)?.title}</span>
                <button onClick={() => setActiveGemId(null)} aria-label="إلغاء الشخصية" className="hover:text-purple-900 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          {activeChat && activeChat.messages.length > 0 && (
            <ComposerSlot variant="docked" engine={engine} ui={composerUi} />
          )}
        </div>

        {showScrollToBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 end-6 p-2.5 bg-accent text-white rounded-full shadow-lg transition-all z-20 hover:bg-accent-hover"
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

      <ModalHost
        isSkillsManagerOpen={isSkillsManagerOpen} onCloseSkillsManager={() => setIsSkillsManagerOpen(false)}
        skillsRegistry={skillsRegistry} onToggleSkill={handleToggleSkill} onRegistryChanged={refreshSkillsRegistry}
        showOnboarding={isUnlocked && showOnboarding} onCloseOnboarding={() => setShowOnboarding(false)}
        isFilesOpen={isFilesOpen} onCloseFiles={() => setIsFilesOpen(false)}
        isGemsOpen={isGemsOpen} onCloseGems={() => setIsGemsOpen(false)} activeGemId={activeGemId} onSelectGem={setActiveGemId}
        isImageStudioOpen={isImageStudioOpen} onCloseImageStudio={() => setIsImageStudioOpen(false)} imageStudioChatId={activeChatId || undefined}
        isUpgradeOpen={isUpgradeOpen} onCloseUpgrade={() => setIsUpgradeOpen(false)}
        isPromptEditOpen={isPromptEditOpen} onClosePromptEdit={() => setIsPromptEditOpen(false)}
        customPrompt={settings.systemPrompt} onSavePrompt={(p) => setSettings(prev => ({ ...prev, systemPrompt: p }))}
        isProfileOpen={isProfileOpen} onCloseProfile={() => setIsProfileOpen(false)} userName={userName} onChangeName={setUserName}
        isSettingsOpen={isSettingsOpen} onCloseSettings={() => setIsSettingsOpen(false)}
        settings={settings} onUpdateSettings={setSettings} providers={APP_CONFIG.defaultProviders}
        onAddCustomProvider={(prov) => setSettings(prev => ({ ...prev, customProviders: [...prev.customProviders, prov] }))}
        onDeleteCustomProvider={(id) => setSettings(prev => ({ ...prev, customProviders: prev.customProviders.filter(p => p.id !== id) }))}
        onExportBackup={() => exportBackup(chats, settings)}
        onImportBackup={handleImportBackup}
        onClearData={() => setChats([])}
        isAuthModalOpen={isAuthModalOpen} onCloseAuth={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setUserName(user.username);
          const token = (user as any).token;
          if (token) {
            setSettings(prev => ({ ...prev, userAuthToken: token }));
            localStorage.setItem('mijlai_auth_token', token);
          }
        }}
        isAdminModalOpen={isAdminModalOpen} onCloseAdmin={() => setIsAdminModalOpen(false)} currentUser={currentUser}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportBackupFile}
      />

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
          { id: 'toggle-theme', title: 'تبديل المظهر (فاتح/داكن)', icon: <Moon className="w-4 h-4" />, run: () => { const next = isDarkTheme(settings.theme) ? 'light' : 'dark'; withViewTransition(() => setSettings(prev => ({ ...prev, theme: next }))); } },
        ]}
      />

      <ToastHost />
    </div>
  );
}
