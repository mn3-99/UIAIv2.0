import React from 'react';
import { Sparkles } from 'lucide-react';

interface SkeletonMessageProps {
  isUser?: boolean;
}

const SkeletonMessage: React.FC<SkeletonMessageProps> = ({ isUser = false }) => (
  <div className={`w-full flex my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[88%] md:max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`relative px-5 py-4.5 sm:px-6 sm:py-5 ${
        isUser
          ? 'bg-gradient-to-br from-blue-100 to-blue-200 rounded-[28px] rounded-br-md'
          : 'bg-white/95 border border-slate-200/80 rounded-[28px] rounded-bl-md backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-7 h-7 rounded-full skeleton ${
            isUser ? 'bg-blue-200' : 'bg-slate-200'
          }`} />
          <div className={`h-3 w-16 rounded-full skeleton ${
            isUser ? 'bg-blue-200' : 'bg-slate-200'
          }`} />
        </div>
        
        <div className="space-y-2">
          <div className={`h-3 rounded-full skeleton ${isUser ? 'bg-blue-200' : 'bg-slate-200'}`} style={{ width: '90%' }} />
          <div className={`h-3 rounded-full skeleton ${isUser ? 'bg-blue-200' : 'bg-slate-200'}`} style={{ width: '75%' }} />
          <div className={`h-3 rounded-full skeleton ${isUser ? 'bg-blue-200' : 'bg-slate-200'}`} style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  </div>
);

/**
 * Shimmer placeholder for the "first-token wait" — the gap between sending a
 * prompt and the first streamed token arriving. Masks real network/queue
 * latency instead of showing an empty bubble (perceived-latency reduction).
 */
export const SkeletonLines: React.FC = () => (
  <div className="space-y-2 py-1 min-w-[180px]" aria-hidden="true">
    <div className="h-3 rounded-full skeleton bg-slate-200" style={{ width: '100%' }} />
    <div className="h-3 rounded-full skeleton bg-slate-200" style={{ width: '72%' }} />
    <div className="h-3 rounded-full skeleton bg-slate-200" style={{ width: '45%' }} />
  </div>
);

export const SkeletonChat: React.FC = () => (
  <div className="w-full space-y-4 p-4">
    <SkeletonMessage isUser />
    <SkeletonMessage />
    <SkeletonMessage isUser />
    <SkeletonMessage />
  </div>
);

export const SkeletonComposer: React.FC = () => (
  <div className="w-full max-w-[760px] md:w-[75%] mx-auto px-2">
    <div className="w-full bg-white/95 rounded-3xl border border-slate-200/90 p-4 space-y-3">
      <div className="h-10 rounded-full skeleton bg-slate-200" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-20 h-8 rounded-full skeleton bg-slate-200" />
          <div className="w-24 h-8 rounded-full skeleton bg-slate-200" />
        </div>
        <div className="w-8 h-8 rounded-full skeleton bg-slate-200" />
      </div>
    </div>
  </div>
);

export const SkeletonSidebar: React.FC = () => (
  <div className="w-[300px] max-w-[85vw] h-full bg-white p-4 space-y-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full skeleton bg-slate-200" />
        <div className="h-5 w-24 rounded-full skeleton bg-slate-200" />
      </div>
      <div className="w-6 h-6 rounded-full skeleton bg-slate-200" />
    </div>
    
    <div className="space-y-2 pt-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2.5">
          <div className="w-8 h-8 rounded-lg skeleton bg-slate-200" />
          <div className="h-4 w-32 rounded-full skeleton bg-slate-200" />
        </div>
      ))}
    </div>
  </div>
);
