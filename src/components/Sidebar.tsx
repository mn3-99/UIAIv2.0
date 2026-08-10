import React, { useState, useMemo } from 'react';
import {
  MessageSquare, Plus, Search, Pin, Trash2, Edit2, Check, X,
  Download, Upload, ExternalLink, Sparkles, HelpCircle
} from 'lucide-react';
import { ChatSession } from '../types';
import { APP_CONFIG } from '../config';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onTogglePin: (id: string) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onOpenShortcuts: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onTogglePin,
  onExportBackup,
  onImportBackup,
  onOpenShortcuts
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filter & Group chats by date
  const groupedChats = useMemo(() => {
    const filtered = chats.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const pinned: ChatSession[] = [];
    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const thisWeek: ChatSession[] = [];
    const older: ChatSession[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 86400000 * 6;

    filtered.forEach(chat => {
      if (chat.pinned) {
        pinned.push(chat);
        return;
      }
      const time = chat.updatedAt || chat.createdAt;
      if (time >= todayStart) {
        today.push(chat);
      } else if (time >= yesterdayStart) {
        yesterday.push(chat);
      } else if (time >= weekStart) {
        thisWeek.push(chat);
      } else {
        older.push(chat);
      }
    });

    return { pinned, today, yesterday, thisWeek, older };
  }, [chats, searchQuery]);

  const startEditing = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveEditing = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingTitle.trim()) {
      onRenameChat(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 right-0 bottom-0 w-80 bg-slate-900 border-l border-slate-800/80 z-50 flex flex-col transition-transform duration-250 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header & New Chat button */}
        <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-200 text-sm">المحادثات</span>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-950/40 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>محادثة جديدة</span>
          </button>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="بحث في المحادثات... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Chat List Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {chats.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-500 text-xs">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              لا توجد محادثات سابقة بعد. ابدأ محادثة جديدة!
            </div>
          ) : (
            <>
              {/* Pinned Section */}
              {groupedChats.pinned.length > 0 && (
                <RenderChatGroup
                  title="المثبتة"
                  chats={groupedChats.pinned}
                  activeChatId={activeChatId}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  confirmDeleteId={confirmDeleteId}
                  setEditingTitle={setEditingTitle}
                  onSelectChat={(id) => { onSelectChat(id); onClose(); }}
                  startEditing={startEditing}
                  saveEditing={saveEditing}
                  setConfirmDeleteId={setConfirmDeleteId}
                  onDeleteChat={onDeleteChat}
                  onTogglePin={onTogglePin}
                />
              )}

              {/* Today */}
              {groupedChats.today.length > 0 && (
                <RenderChatGroup
                  title="اليوم"
                  chats={groupedChats.today}
                  activeChatId={activeChatId}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  confirmDeleteId={confirmDeleteId}
                  setEditingTitle={setEditingTitle}
                  onSelectChat={(id) => { onSelectChat(id); onClose(); }}
                  startEditing={startEditing}
                  saveEditing={saveEditing}
                  setConfirmDeleteId={setConfirmDeleteId}
                  onDeleteChat={onDeleteChat}
                  onTogglePin={onTogglePin}
                />
              )}

              {/* Yesterday */}
              {groupedChats.yesterday.length > 0 && (
                <RenderChatGroup
                  title="أمس"
                  chats={groupedChats.yesterday}
                  activeChatId={activeChatId}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  confirmDeleteId={confirmDeleteId}
                  setEditingTitle={setEditingTitle}
                  onSelectChat={(id) => { onSelectChat(id); onClose(); }}
                  startEditing={startEditing}
                  saveEditing={saveEditing}
                  setConfirmDeleteId={setConfirmDeleteId}
                  onDeleteChat={onDeleteChat}
                  onTogglePin={onTogglePin}
                />
              )}

              {/* This Week */}
              {groupedChats.thisWeek.length > 0 && (
                <RenderChatGroup
                  title="هذا الأسبوع"
                  chats={groupedChats.thisWeek}
                  activeChatId={activeChatId}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  confirmDeleteId={confirmDeleteId}
                  setEditingTitle={setEditingTitle}
                  onSelectChat={(id) => { onSelectChat(id); onClose(); }}
                  startEditing={startEditing}
                  saveEditing={saveEditing}
                  setConfirmDeleteId={setConfirmDeleteId}
                  onDeleteChat={onDeleteChat}
                  onTogglePin={onTogglePin}
                />
              )}

              {/* Older */}
              {groupedChats.older.length > 0 && (
                <RenderChatGroup
                  title="أقدم"
                  chats={groupedChats.older}
                  activeChatId={activeChatId}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  confirmDeleteId={confirmDeleteId}
                  setEditingTitle={setEditingTitle}
                  onSelectChat={(id) => { onSelectChat(id); onClose(); }}
                  startEditing={startEditing}
                  saveEditing={saveEditing}
                  setConfirmDeleteId={setConfirmDeleteId}
                  onDeleteChat={onDeleteChat}
                  onTogglePin={onTogglePin}
                />
              )}
            </>
          )}
        </div>

        {/* Sidebar Footer with Export/Import + Copyright link */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <button
              onClick={onExportBackup}
              className="flex items-center gap-1 hover:text-emerald-400 transition-colors p-1"
              title="تصدير JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير</span>
            </button>
            <button
              onClick={onImportBackup}
              className="flex items-center gap-1 hover:text-emerald-400 transition-colors p-1"
              title="استيراد JSON"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>استيراد</span>
            </button>
            <button
              onClick={onOpenShortcuts}
              className="flex items-center gap-1 hover:text-emerald-400 transition-colors p-1"
              title="اختصارات"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>مساعدة</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-center text-[11px] text-slate-500 font-sans">
            <a
              href={APP_CONFIG.officialDomain}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
            >
              <span>{APP_CONFIG.name} — {APP_CONFIG.copyright}</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};

// Helper component for group rendering
interface RenderGroupProps {
  title: string;
  chats: ChatSession[];
  activeChatId: string | null;
  editingId: string | null;
  editingTitle: string;
  confirmDeleteId: string | null;
  setEditingTitle: (t: string) => void;
  onSelectChat: (id: string) => void;
  startEditing: (chat: ChatSession, e: React.MouseEvent) => void;
  saveEditing: (id: string, e?: React.FormEvent) => void;
  setConfirmDeleteId: (id: string | null) => void;
  onDeleteChat: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const RenderChatGroup: React.FC<RenderGroupProps> = ({
  title,
  chats,
  activeChatId,
  editingId,
  editingTitle,
  confirmDeleteId,
  setEditingTitle,
  onSelectChat,
  startEditing,
  saveEditing,
  setConfirmDeleteId,
  onDeleteChat,
  onTogglePin
}) => (
  <div className="space-y-1">
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
      {title}
    </div>
    {chats.map(chat => {
      const isActive = chat.id === activeChatId;
      const isEditing = editingId === chat.id;
      const isDeleting = confirmDeleteId === chat.id;

      return (
        <div
          key={chat.id}
          onClick={() => onSelectChat(chat.id)}
          className={`group relative flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all ${
            isActive
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium'
              : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
            
            {isEditing ? (
              <form onSubmit={(e) => saveEditing(chat.id, e)} className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  autoFocus
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                />
                <button type="submit" className="p-0.5 text-emerald-400 hover:text-emerald-300">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <span className="truncate">{chat.title || 'محادثة بدون عنوان'}</span>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isDeleting ? (
                <div className="flex items-center gap-1 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                    className="text-red-400 hover:text-red-300 text-[10px] font-bold"
                  >
                    تأكيد الحذف
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(chat.id); }}
                    className={`p-1 rounded hover:bg-slate-700 ${chat.pinned ? 'text-emerald-400' : 'text-slate-400'}`}
                    title={chat.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => startEditing(chat, e)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700"
                    title="تعديل العنوان"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(chat.id); }}
                    className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-slate-700"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
);
