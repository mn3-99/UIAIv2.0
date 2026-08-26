import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MessageSquare, CornerDownLeft } from 'lucide-react';
import { ChatSession } from '../types';
import { useModalA11y } from '../utils/useModalA11y';

export interface PaletteAction {
  id: string;
  title: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatSession[];
  actions: PaletteAction[];
  onSelectChat: (id: string) => void;
}

interface FlatItem {
  kind: 'action' | 'chat';
  id: string;
  title: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Cmd/Ctrl+K command palette: instant fuzzy search over chats + app actions,
 * full keyboard navigation (arrows/Enter/Escape), RTL-native.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, chats, actions, onSelectChat }) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIdx(0);
      // Defer so the dialog is mounted before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const items = useMemo<FlatItem[]>(() => {
    const q = query.trim().toLowerCase();
    const actionItems: FlatItem[] = actions
      .filter((a) => !q || a.title.toLowerCase().includes(q))
      .map((a) => ({ kind: 'action', id: a.id, title: a.title, hint: a.hint, icon: a.icon, run: a.run }));
    const chatItems: FlatItem[] = chats
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content?.toLowerCase().includes(q)))
      .slice(0, 8)
      .map((c) => ({
        kind: 'chat',
        id: c.id,
        title: c.title || 'محادثة بدون عنوان',
        hint: `${c.messages.length} رسالة`,
        icon: <MessageSquare className="w-4 h-4" />,
        run: () => onSelectChat(c.id)
      }));
    return [...actionItems, ...chatItems];
  }, [query, chats, actions, onSelectChat]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Keep the active row visible while navigating with the keyboard.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!isOpen) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) {
        onClose();
        item.run();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center pt-[12vh] px-4 bg-slate-950/50 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="لوحة الأوامر"
        tabIndex={-1}
        className="w-full max-w-xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المحادثات أو نفّذ أمراً…"
            className="flex-1 bg-transparent py-3.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            aria-label="بحث الأوامر والمحادثات"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">لا توجد نتائج مطابقة</div>
          )}
          {items.map((item, idx) => (
            <button
              key={`${item.kind}-${item.id}`}
              data-idx={idx}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => { onClose(); item.run(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors ${
                idx === activeIdx ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className={`shrink-0 ${idx === activeIdx ? 'text-white' : 'text-slate-400'}`}>{item.icon}</span>
              <span className="flex-1 text-xs font-semibold truncate">{item.title}</span>
              {item.hint && (
                <span className={`text-[10px] shrink-0 ${idx === activeIdx ? 'text-blue-100' : 'text-slate-400'}`}>{item.hint}</span>
              )}
              {idx === activeIdx && <CornerDownLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1 font-mono">↑↓</kbd> للتنقل</span>
          <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1 font-mono">Enter</kbd> للتنفيذ</span>
          <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1 font-mono">Ctrl+K</kbd> للفتح</span>
        </div>
      </div>
    </div>
  );
};
