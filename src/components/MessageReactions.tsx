import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Heart, Lightbulb, Flame, PartyPopper } from 'lucide-react';

export interface Reaction {
  emoji: string;
  icon: string;
  label: string;
}

const REACTIONS: Reaction[] = [
  { emoji: '👍', icon: 'thumbs-up', label: 'مفيد' },
  { emoji: '❤️', icon: 'heart', label: 'أحببته' },
  { emoji: '💡', icon: 'lightbulb', label: 'ملهم' },
  { emoji: '🔥', icon: 'flame', label: 'ممتاز' },
  { emoji: '🎉', icon: 'party', label: 'رائع' },
  { emoji: '👎', icon: 'thumbs-down', label: 'لم يعجبني' },
];

interface MessageReactionsProps {
  messageId: string;
  reactions?: Record<string, boolean>;
  onReact?: (messageId: string, emoji: string) => void;
  isUser?: boolean;
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  messageId,
  reactions = {},
  onReact,
  isUser = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const activeReactions = Object.entries(reactions).filter(([_, active]) => active);

  const handleReact = (emoji: string) => {
    onReact?.(messageId, emoji);
    setShowPicker(false);
  };

  if (isUser) return null;

  return (
    <div
      className="flex items-center gap-1.5 mt-2 flex-wrap"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowPicker(false);
      }}
    >
      {activeReactions.map(([emoji]) => (
        <button
          key={emoji}
          onClick={() => handleReact(emoji)}
          className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-sm hover:bg-blue-100 transition-all press-effect scale-in-bounce"
        >
          <span>{emoji}</span>
        </button>
      ))}

      {(isHovered || showPicker) && (
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 transition-all press-effect text-slate-500"
            title="إضافة رد فعل"
          >
            <span className="text-sm">+</span>
          </button>

          {showPicker && (
            <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white border border-slate-200 shadow-xl scale-in-bounce z-50">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => handleReact(reaction.emoji)}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-all press-effect hover:scale-125"
                  title={reaction.label}
                >
                  <span className="text-lg">{reaction.emoji}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
