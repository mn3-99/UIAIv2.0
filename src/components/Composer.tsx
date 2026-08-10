import React, { useRef, useEffect } from 'react';
import { Send, Square, Sparkles, SlidersHorizontal } from 'lucide-react';
import { AppSettings, ProviderConfig } from '../types';

interface ComposerProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  settings: AppSettings;
  providers: ProviderConfig[];
  onSelectModel: (providerId: string, modelId: string) => void;
  onUpdateTemperature: (temp: number) => void;
}

export const Composer: React.FC<ComposerProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isGenerating,
  settings,
  providers,
  onSelectModel,
  onUpdateTemperature
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTempSlider, setShowTempSlider] = React.useState(false);

  // Auto expand textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isGenerating) {
        onSend();
      }
    }
  };

  const activeProvider = providers.find(p => p.id === settings.activeProviderId) || providers[0];

  return (
    <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800/80 backdrop-blur-md sticky bottom-0 z-20">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Model Bar & Controls */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <select
                value={`${settings.activeProviderId}:${settings.activeModelId}`}
                onChange={(e) => {
                  const [pId, ...rest] = e.target.value.split(':');
                  const mId = rest.join(':');
                  onSelectModel(pId, mId);
                }}
                className="bg-transparent text-slate-300 outline-none text-xs cursor-pointer max-w-[200px] sm:max-w-[280px] truncate"
              >
                {providers.map(p => (
                  <optgroup key={p.id} label={p.name}>
                    {p.models.map(m => {
                      const isG4fModel = m.id.startsWith('g4f:') || m.provider === 'g4f' || p.id === 'g4f' || Boolean(m.is_free);
                      const cleanName = m.name.replace(/\s*\((?:g4f\s*)?Free\)/i, '').trim();
                      const displayLabel = isG4fModel ? `${cleanName} [FREE / G4F]` : m.name;
                      return (
                        <option key={`${p.id}:${m.id}`} value={`${p.id}:${m.id}`} className="bg-slate-900 text-slate-200 font-medium">
                          {displayLabel}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
              {(settings.activeModelId.startsWith('g4f:') || settings.activeProviderId === 'g4f') && (
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap inline-flex items-center gap-1 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  [FREE / G4F]
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowTempSlider(!showTempSlider)}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1 transition-colors"
              title="تعديل درجات حرارة النموذج (Temperature)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Temp: {settings.temperature}</span>
            </button>

            {showTempSlider && (
              <div className="absolute left-0 bottom-full mb-2 bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-xl w-48 space-y-1.5 z-30">
                <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                  <span>التنوع والابتكار</span>
                  <span className="text-emerald-400">{settings.temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) => onUpdateTemperature(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>دقيق/منطقي</span>
                  <span>مبدع/متنوع</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Textarea & Action Button Container */}
        <div className="relative flex items-end bg-slate-950/90 border border-slate-800 rounded-2xl shadow-inner focus-within:border-emerald-500/60 transition-colors">
          <textarea
            ref={textareaRef}
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
            rows={1}
            className="w-full bg-transparent py-3.5 pr-4 pl-14 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-48 overflow-y-auto"
          />

          <div className="absolute left-2.5 bottom-2.5 flex items-center gap-1.5">
            {isGenerating ? (
              <button
                onClick={onStop}
                className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-md transition-all active:scale-95"
                title="إيقاف التوليد"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!input.trim()}
                className={`p-2 rounded-xl transition-all shadow-md ${
                  input.trim()
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
                title="إرسال"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic keyboard hint */}
        <div className="text-[10px] text-center text-slate-500">
          MijlAi قد ينتج إجابات تحتاج مراجعة. يدعم التنسيق التلقائي والرموز البرمجية.
        </div>
      </div>
    </div>
  );
};
