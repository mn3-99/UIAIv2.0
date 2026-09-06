import React, { useState } from 'react';
import { Volume2, Square, Minus, Plus } from 'lucide-react';
import { speakText, stopSpeaking } from '../utils/tts';

/**
 * Reading Mode — وضع القراءة المريحة
 * عرض نص الرد كفقرات واضحة بخط مريح وحجم قابل للضبط مع زر قراءة صوتي.
 * (لا يستبدل المحادثة؛ يُفعَّل داخل الفقاعة عند الضغط على "قراءة مريحة".)
 */

interface ReadingModePaneProps {
  content: string;
  onClose: () => void;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/\n/g, ' '))
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>~|]+/g, '')
    .trim();
}

export const ReadingModePane: React.FC<ReadingModePaneProps> = React.memo(({ content, onClose }) => {
  const [fontScale, setFontScale] = useState(1.15);
  const [reading, setReading] = useState(false);

  const paragraphs = stripMarkdown(content)
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const handleToggleRead = () => {
    if (reading) {
      stopSpeaking();
      setReading(false);
      return;
    }
    const ok = speakText(content, () => setReading(false));
    if (ok) setReading(true);
  };

  return (
    <div dir="rtl" className="my-1 rounded-2xl border border-line/80 bg-surface/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-muted flex items-center gap-1.5">
          📖 وضع القراءة المريحة
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFontScale((s) => Math.max(0.95, +(s - 0.1).toFixed(2)))}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-card text-muted transition-colors"
            aria-label="تصغير الخط"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setFontScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-card text-muted transition-colors"
            aria-label="تكبير الخط"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleRead}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${reading ? 'bg-accent text-white' : 'hover:bg-card text-muted'}`}
            aria-label={reading ? 'إيقاف القراءة الصوتية' : 'قراءة النص صوتياً'}
            title={reading ? 'إيقاف القراءة' : 'قراءة صوتية'}
          >
            {reading ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-card text-faint transition-colors"
            aria-label="إغلاق وضع القراءة"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 pl-1 reading-pane-scroll"
        style={{ fontSize: `${Math.round(15 * fontScale)}px`, lineHeight: 2 }}
      >
        {paragraphs.length === 0 && <p className="text-muted text-sm">{content}</p>}
        {paragraphs.map((p, i) => (
          <p key={i} className="text-main leading-[2] text-justify">{p}</p>
        ))}
      </div>
    </div>
  );
});

ReadingModePane.displayName = 'ReadingModePane';
