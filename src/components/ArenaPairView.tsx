import React from 'react';
import { Swords, Trophy, Scale, ThumbsUp } from 'lucide-react';
import { ChatMessage } from '../types';
import { RichMarkdown } from './RichMarkdown';

interface ArenaPairViewProps {
  left: ChatMessage;
  right: ChatMessage;
  onVote?: (groupId: string, vote: 'left' | 'right' | 'tie') => void;
}

function formatMs(ms?: number): string {
  if (!ms && ms !== 0) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}ث` : `${Math.round(ms)}مث`;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
      <span className="text-slate-400">{label}</span>
      <span dir="ltr">{value}</span>
    </span>
  );
}

function ArenaColumn({ msg, accent }: { msg: ChatMessage; accent: string }) {
  const isStreaming = msg.status === 'streaming';
  const isError = msg.status === 'error';
  return (
    <div className={`flex-1 min-w-0 rounded-2xl border ${isError ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'} overflow-hidden flex flex-col`}>
      <div className={`px-3 py-2 border-b border-slate-100 flex items-center gap-2 ${accent}`}>
        <span className="text-[11px] font-bold truncate">{msg.arenaLabel || msg.modelId || 'نموذج'}</span>
        {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
      </div>
      <div className="p-3 text-[13px] leading-relaxed flex-1 overflow-x-hidden">
        {isError ? (
          <div className="text-red-600 text-xs font-semibold">{msg.errorDetails || 'فشل التوليد'}</div>
        ) : (
          <RichMarkdown content={msg.content} isStreaming={isStreaming} />
        )}
        {isStreaming && !msg.content && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm" />}
      </div>
      {!isStreaming && msg.arenaStats && (
        <div className="px-3 py-2 border-t border-slate-100 flex flex-wrap gap-1.5" dir="ltr">
          <StatChip label="TTFT" value={formatMs(msg.arenaStats.ttftMs)} />
          <StatChip label="الإجمالي" value={formatMs(msg.arenaStats.totalMs)} />
          <StatChip label="حرف/ث" value={String(msg.arenaStats.charsPerSec ?? '—')} />
        </div>
      )}
    </div>
  );
}

/**
 * Arena view: two model answers side-by-side (stacked on small screens) with
 * live streaming, per-side performance stats, and a vote control.
 */
export const ArenaPairView: React.FC<ArenaPairViewProps> = ({ left, right, onVote }) => {
  const groupId = left.arenaGroup || '';
  const vote = left.arenaVote || null;
  const done = left.status !== 'streaming' && right.status !== 'streaming';

  const voteBtn = (v: 'left' | 'right' | 'tie', label: string, icon: React.ReactNode) => (
    <button
      onClick={() => onVote?.(groupId, v)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
        vote === v
          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="w-full my-3" dir="rtl">
      <div className="flex items-center gap-2 mb-2 text-purple-700">
        <Swords className="w-4 h-4" />
        <span className="text-[11px] font-bold">ساحة المقارنة — نفس السؤال، نموذجان</span>
      </div>
      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        <ArenaColumn msg={left} accent="bg-blue-50 text-blue-800" />
        <ArenaColumn msg={right} accent="bg-purple-50 text-purple-800" />
      </div>
      {done && onVote && (
        <div className="flex items-center gap-2 mt-2">
          {voteBtn('left', 'الأيسر أفضل', <ThumbsUp className="w-3.5 h-3.5" />)}
          {voteBtn('tie', 'تعادل', <Scale className="w-3.5 h-3.5" />)}
          {voteBtn('right', 'الأيمن أفضل', <Trophy className="w-3.5 h-3.5" />)}
          {vote && <span className="text-[10px] text-slate-400 font-semibold">صوتك محفوظ لهذه الجولة</span>}
        </div>
      )}
    </div>
  );
};
