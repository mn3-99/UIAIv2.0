import React from 'react';
import { Sparkles } from 'lucide-react';

interface TypingIndicatorProps {
  modelName?: string;
  phase?: 'connecting' | 'thinking' | 'generating';
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  modelName = 'MijlAi',
  phase = 'generating'
}) => {
  const phaseLabels: Record<string, string> = {
    connecting: 'يتصل بالنموذج',
    thinking: 'يفكر ويحلل',
    generating: 'يكتب الرد'
  };

  return (
    <div className="w-full flex justify-start my-4 fade-in-up">
      <div className="max-w-[88%] md:max-w-[82%]">
        <div className="bg-white/95 border border-slate-200/80 text-slate-800 rounded-[28px] rounded-bl-md px-5 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-emerald-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white pulse-ring" />
            </div>
            
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-800">{modelName}</span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {phaseLabels[phase] || phaseLabels.generating}
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <span className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
                <span className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
                <span className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
