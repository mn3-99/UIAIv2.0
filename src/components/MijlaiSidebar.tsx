import React, { useState } from 'react';
import {
  Menu, SquarePen, Search, Brush, Folder, LayoutGrid,
  Sparkles, Settings, X, Trash2, Pin, MessageSquare, User, LogIn, ChevronDown, ShieldCheck, ImagePlus
} from 'lucide-react';
import { ChatSession, UserAccount } from '../types';
import { MijlaiLogo } from './MijlaiLogo';

interface MijlaiSidebarProps {
  isOpen: boolean;
  onCloseSidebar: () => void;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onOpenCanvas: () => void;
  onOpenFiles: () => void;
  onOpenGems: () => void;
  onOpenImageStudio: () => void;
  onOpenUpgrade: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenAuthModal: () => void;
  onOpenAdminPanel: () => void;
  currentUser: UserAccount | null;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  userName: string;
}

interface NavItemProps {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}

const NavItem: React.FC<NavItemProps> = ({ id, icon: Icon, label, onClick, active, badge }) => (
  <button
    id={id}
    onClick={onClick}
    role="menuitem"
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
      active
        ? 'bg-blue-50 text-blue-700'
        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <span
      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
    </span>
    <span className="truncate">{label}</span>
    {typeof badge === 'number' && badge > 0 && (
      <span className="ms-auto text-[10px] font-bold bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">
        {badge}
      </span>
    )}
  </button>
);

export const MijlaiSidebar: React.FC<MijlaiSidebarProps> = ({
  isOpen,
  onCloseSidebar,
  isHistoryOpen,
  onToggleHistory,
  onNewChat,
  onOpenCanvas,
  onOpenFiles,
  onOpenGems,
  onOpenImageStudio,
  onOpenUpgrade,
  onOpenSettings,
  onOpenProfile,
  onOpenAuthModal,
  onOpenAdminPanel,
  currentUser,
  chats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
  onTogglePin
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <>
      {/* Scrim — light blurred backdrop that closes the drawer on click */}
      <div
        aria-hidden="true"
        onClick={onCloseSidebar}
        className={`fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer — single full panel with every function; slides in from the right.
          Fixed over the content so opening it never shifts the layout. */}
      <aside
        id="mijlai_sidebar"
        role="dialog"
        aria-modal={isOpen}
        aria-label="القائمة والشريط الجانبي"
        aria-hidden={!isOpen}
        tabIndex={-1}
        inert={!isOpen}
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
        className={`fixed top-0 bottom-0 right-0 z-50 flex h-full w-[300px] max-w-[85vw] flex-col bg-white shadow-2xl select-none transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]`}
      >
        {/* Header — logo + close */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-4">
          <button
            id="logo_btn"
            onClick={onNewChat}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            title="MijlAI الرئيسية"
          >
            <MijlaiLogo size="sm" />
            <span className="text-lg font-extrabold text-slate-800">MijlAi</span>
          </button>
          <button
            id="sidebar_close_btn"
            onClick={onCloseSidebar}
            aria-label="إغلاق الشريط الجانبي"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body — navigation + history */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <nav role="menu" aria-label="الأدوات" className="space-y-1">
            <NavItem id="new_chat" icon={SquarePen} label="محادثة جديدة" onClick={onNewChat} active />
            <NavItem
              id="history_toggle"
              icon={Menu}
              label="سجل المحادثات"
              onClick={onToggleHistory}
              active={isHistoryOpen}
              badge={chats.length}
            />
            <NavItem id="image_studio" icon={ImagePlus} label="استوديو الصور" onClick={onOpenImageStudio} />
            <NavItem id="canvas_tool" icon={Brush} label="مساحة الكتابة (Canvas)" onClick={onOpenCanvas} />
            <NavItem id="file_manager" icon={Folder} label="إدارة الملفات" onClick={onOpenFiles} />
            <NavItem id="gems_store" icon={LayoutGrid} label="Gems / المساعدون" onClick={onOpenGems} />
            <NavItem id="upgrade_btn" icon={Sparkles} label="ترقية Mijlai Pro" onClick={onOpenUpgrade} />
          </nav>

          {/* History section — expands inside the drawer */}
          {isHistoryOpen && (
            <section aria-label="سجل المحادثات" className="mt-3 border-t border-slate-100 pt-3">
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في السجل..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1 max-h-[38vh] overflow-y-auto pl-1">
                {filteredChats.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    {searchQuery ? 'لا توجد نتائج' : 'لا توجد محادثات مسجلة'}
                  </div>
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

              <button
                onClick={onToggleHistory}
                className="w-full mt-1 flex items-center justify-center gap-1 py-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                إغلاق السجل
              </button>
            </section>
          )}
        </div>

        {/* Footer — settings + account */}
        <div className="border-t border-slate-100 px-3 py-3 space-y-1">
          <NavItem id="settings_btn" icon={Settings} label="الإعدادات" onClick={onOpenSettings} />
          {currentUser?.role === 'admin' && (
            <NavItem
              id="admin_panel_btn"
              icon={ShieldCheck}
              label="لوحة تحكم الأدمن"
              onClick={onOpenAdminPanel}
            />
          )}
          {currentUser ? (
            <NavItem
              id="user_profile_sidebar"
              icon={User}
              label={`الحساب: ${currentUser.username}`}
              onClick={onOpenProfile}
            />
          ) : (
            <NavItem
              id="auth_signin_sidebar"
              icon={LogIn}
              label="تسجيل الدخول / Sign In"
              onClick={onOpenAuthModal}
            />
          )}
        </div>
      </aside>
    </>
  );
};