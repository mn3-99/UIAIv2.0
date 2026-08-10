import React, { useState } from 'react';
import {
  Menu, SquarePen, Search, Brush, Folder, LayoutGrid,
  Sparkles, Settings, X, Trash2, Pin, MessageSquare, User, LogIn
} from 'lucide-react';
import { ChatSession, UserAccount } from '../types';
import { MijlaiLogo } from './MijlaiLogo';

interface MijlaiSidebarProps {
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onOpenCanvas: () => void;
  onOpenFiles: () => void;
  onOpenGems: () => void;
  onOpenUpgrade: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenAuthModal: () => void;
  currentUser: UserAccount | null;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  userName: string;
}

export const MijlaiSidebar: React.FC<MijlaiSidebarProps> = ({
  isHistoryOpen,
  onToggleHistory,
  onNewChat,
  onOpenCanvas,
  onOpenFiles,
  onOpenGems,
  onOpenUpgrade,
  onOpenSettings,
  onOpenProfile,
  onOpenAuthModal,
  currentUser,
  chats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
  onTogglePin,
  userName
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <aside className="h-full flex z-30 select-none">
      {/* 1. Left Vertical Icon Strip */}
      <div className="w-[72px] min-w-[72px] h-full bg-white flex flex-col items-center justify-between py-5 border-r border-slate-100 shadow-sm">
        <div className="flex flex-col items-center gap-[14px] w-full">
          {/* Logo button -> returns to main view / new chat */}
          <button
            id="logo_btn"
            onClick={onNewChat}
            className="w-12 h-10 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity mb-1"
            title="MijlAI الرئيسية"
          >
            <MijlaiLogo size="sm" />
          </button>

          {/* Icon 2 - Toggle History */}
          <button
            id="history_toggle"
            onClick={onToggleHistory}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isHistoryOpen ? 'bg-[#e8eaed] text-[#202124]' : 'text-[#5f6368] hover:bg-[#f1f3f4]'
            }`}
            title="سجل المحادثات"
          >
            <Menu className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Icon 3 - New Chat */}
          <button
            id="new_chat"
            onClick={onNewChat}
            className="w-10 h-10 rounded-full bg-[#e8eaed] flex items-center justify-center text-[#202124] hover:bg-[#dadce0] transition-colors shadow-none"
            title="محادثة جديدة"
          >
            <SquarePen className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Icon 4 - Search */}
          <button
            id="search_chats"
            onClick={onToggleHistory}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
            title="البحث في المحادثات"
          >
            <Search className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Icon 5 - Canvas */}
          <button
            id="canvas_tool"
            onClick={onOpenCanvas}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
            title="مساحة الكتابة والكود (Canvas)"
          >
            <Brush className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Icon 6 - Files */}
          <button
            id="file_manager"
            onClick={onOpenFiles}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
            title="إدارة الملفات"
          >
            <Folder className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Icon 7 - Gems */}
          <button
            id="gems_store"
            onClick={onOpenGems}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
            title="Gems / المساعدين المخصصين"
          >
            <LayoutGrid className="w-5 h-5" strokeWidth={2} />
          </button>

          {/* Icon 8 - Pro Diamond */}
          <button
            id="upgrade_btn"
            onClick={onOpenUpgrade}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors"
            title="ترقية إلى Mijlai Pro"
          >
            <Sparkles className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Bottom Icons (Settings & Account / User Profile) */}
        <div className="flex flex-col items-center gap-3">
          {/* Settings */}
          <button
            id="settings_btn"
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors relative"
            title="الإعدادات"
          >
            <Settings className="w-5 h-5" strokeWidth={2} />
            <span className="absolute top-[7px] right-[7px] w-[6px] h-[6px] bg-[#1a73e8] rounded-full" />
          </button>

          {/* User Account / Sign In Icon in Sidebar */}
          {currentUser ? (
            <button
              id="user_profile_sidebar"
              onClick={onOpenProfile}
              className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all shadow-sm"
              title={`الحساب الشخصي (${currentUser.username})`}
            >
              <User className="w-5 h-5 text-white" />
            </button>
          ) : (
            <button
              id="auth_signin_sidebar"
              onClick={onOpenAuthModal}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 flex items-center justify-center cursor-pointer transition-all shadow-xs"
              title="تسجيل الدخول / Sign In"
            >
              <div
                className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 via-rose-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-[12px] leading-none"
                style={{ fontFamily: 'Google Sans, sans-serif' }}
              >
                M
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 2. Expandable History Drawer */}
      {isHistoryOpen && (
        <div className="w-72 h-full bg-[#f8fafc] border-r border-slate-200/80 flex flex-col transition-all duration-200 shadow-md">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <span className="font-semibold text-slate-800 text-sm">سجل المحادثات</span>
            <button onClick={onToggleHistory} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 bg-white border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في السجل..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredChats.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">لا توجد محادثات مسجلة</div>
            ) : (
              filteredChats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                    activeChatId === chat.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'hover:bg-slate-200/60 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
                    <span className="truncate">{chat.title || 'محادثة جديدة'}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(chat.id);
                      }}
                      className="p-1 hover:text-blue-600"
                      title="تثبيت"
                    >
                      <Pin className={`w-3.5 h-3.5 ${chat.pinned ? 'text-blue-600 fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      className="p-1 hover:text-red-600"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
