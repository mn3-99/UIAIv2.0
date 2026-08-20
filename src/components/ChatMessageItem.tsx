import React, { useState } from 'react';
import { Copy, Check, RotateCcw, Edit3, User, AlertCircle, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types';
import { RichMarkdown } from './RichMarkdown';

interface ChatMessageItemProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onEditPrompt?: (newText: string) => void;
  isLastAssistantMessage?: boolean;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  message,
  onRegenerate,
  onEditPrompt,
  isLastAssistantMessage
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editText.trim() && onEditPrompt) {
      onEditPrompt(editText.trim());
      setIsEditing(false);
    }
  };

  // Helper to cleanly format model ID with MijlAI prefix
  const formatModelBadge = (rawModelId?: string) => {
    if (!rawModelId) return 'MijlAI Engine';
    if (rawModelId.startsWith('local:')) {
      const name = rawModelId.replace('local:', '').split('/').pop()?.replace(/\.gguf$/i, '') || rawModelId;
      return `${name} (محلي)`;
    }
    const cleanName = rawModelId.replace('g4f:', '').replace('MijlAI ', '');
    return `MijlAI ${cleanName}`;
  };

  return (
    <div className={`w-full flex my-4 transition-all duration-300 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group relative max-w-[88%] md:max-w-[82%] transition-all ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Soothing Curved Chat Bubble */}
        <div
          className={`relative px-5 py-4.5 sm:px-6 sm:py-5 transition-all duration-200 ${
            isUser
              ? 'bg-gradient-to-br from-[#2563eb] via-[#1d4ed8] to-[#3b82f6] text-white rounded-[28px] rounded-br-md shadow-[0_4px_20px_rgba(37,99,235,0.22),inset_0_1px_1px_rgba(255,255,255,0.3)]'
              : 'bg-white/95 border border-slate-200/80 text-slate-800 rounded-[28px] rounded-bl-md shadow-[0_4px_24px_rgba(0,0,0,0.04)] backdrop-blur-md'
          }`}
        >
          {/* Header Role info & Model Tag */}
          <div className={`flex items-center justify-between gap-3 mb-3 ${isUser ? 'text-blue-100' : 'text-slate-500'}`}>
            <div className="flex items-center gap-2">
              {/* Soothing Bubble Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm transition-transform group-hover:scale-105 ${
                  isUser
                    ? 'bg-white/20 text-white border border-white/30 backdrop-blur-sm'
                    : 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-emerald-500/20'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              </div>

              <span className={`font-semibold text-xs tracking-wide ${isUser ? 'text-white' : 'text-slate-800'}`}>
                {isUser ? 'أنت' : 'MijlAi'}
              </span>

              {!isUser && message.modelId && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-medium border border-emerald-200/60">
                  {formatModelBadge(message.modelId)}
                </span>
              )}
            </div>

            {/* Quick Action Tools */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className={`p-1.5 rounded-xl transition-colors ${
                  isUser ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
                title="نسخ الرسالة"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {isUser && onEditPrompt && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                  title="تعديل الرسالة"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}

              {!isUser && onRegenerate && isLastAssistantMessage && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                  title="إعادة التوليد"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* User Edit Mode */}
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-white/20 border border-white/40 rounded-2xl p-3 text-xs text-white placeholder-blue-200 outline-none resize-none"
                rows={3}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs text-blue-100 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-white text-blue-600 font-bold text-xs rounded-xl shadow-sm hover:bg-blue-50"
                >
                  حفظ وإرسال
                </button>
              </div>
            </form>
          ) : (
            /* Rendered Content */
            <div dir="auto" className="relative text-sm leading-relaxed">
              {isError ? (
                <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 p-3.5 rounded-2xl">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">حدث خطأ أثناء توليد الرد</div>
                    <div className="mt-1 opacity-90">{message.errorDetails || message.content}</div>
                  </div>
                </div>
              ) : message.isImage && !isUser ? (
                <div className="relative">
                  <RichMarkdown content={message.content} isStreaming={isStreaming} isUser={isUser} />
                </div>
              ) : isUser ? (
                <div className="whitespace-pre-wrap font-normal text-white text-[15px] leading-relaxed">{message.content}</div>
              ) : (
                <RichMarkdown content={message.content} isStreaming={isStreaming} isUser={isUser} />
              )}

              {/* Smooth Pulse Streaming Indicator */}
              {isStreaming && (
                <span className="inline-block w-2.5 h-4 ms-1.5 bg-blue-500 animate-pulse rounded-full align-middle" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
