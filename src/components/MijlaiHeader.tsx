import React from 'react';
import { Pencil, User, LogIn, SquarePen } from 'lucide-react';
import { UserAccount } from '../types';

interface MijlaiHeaderProps {
  onOpenEditPrompt: () => void;
  onOpenAuthModal: () => void;
  onNewChat?: () => void;
  currentUser: UserAccount | null;
}

export const MijlaiHeader: React.FC<MijlaiHeaderProps> = ({
  onOpenEditPrompt,
  onOpenAuthModal,
  onNewChat,
  currentUser
}) => {
  return (
    <div className="absolute top-4 right-4 md:top-6 md:right-7 z-10 flex items-center gap-2.5">
      {/* Auth / Account Badge (Sign In for users) */}
      <button
        id="auth_account_btn"
        onClick={onOpenAuthModal}
        className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-all shadow-2xs border backdrop-blur-md ${
          currentUser
            ? 'bg-blue-50/90 text-blue-700 border-blue-200/80 hover:bg-blue-100'
            : 'bg-white/90 text-slate-700 border-slate-200/80 hover:bg-white hover:text-blue-600'
        }`}
        title={currentUser ? `مسجل كـ: ${currentUser.username}` : 'تسجيل الدخول / Sign In'}
      >
        {currentUser ? (
          <>
            <User className="w-3.5 h-3.5 text-blue-600" />
            <span className="max-w-[100px] truncate">{currentUser.username}</span>
          </>
        ) : (
          <>
            <LogIn className="w-3.5 h-3.5 text-slate-600" />
            <span>تسجيل الدخول</span>
          </>
        )}
      </button>

      {/* Sleek Smooth Top-Right Pen Icon (New Chat / Edit Prompt) */}
      <button
        id="edit_prompt_pen_btn"
        onClick={onNewChat || onOpenEditPrompt}
        className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-blue-600 border border-slate-200/80 shadow-2xs hover:shadow-md flex items-center justify-center transition-all duration-200 backdrop-blur-md active:scale-95 cursor-pointer"
        title="محادثة جديدة / كتابة جديدة"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  );
};
