import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Copy, Check, Download, FileCode, Eye, Code2 } from 'lucide-react';

export type CanvasKind = 'html' | 'svg' | 'mermaid' | 'code' | 'text';

interface CanvasPanelProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  kind?: CanvasKind;
  onChangeContent?: (val: string) => void;
}

/** Detect the artifact kind from raw content. */
export function detectCanvasKind(content: string): CanvasKind {
  const c = (content || '').trim();
  if (!c) return 'text';
  if (/^```mermaid/i.test(c) || /^(graph|sequenceDiagram|flowchart|classDiagram|erDiagram|gantt|stateDiagram|pie|journey)\b/.test(c)) return 'mermaid';
  if (/^<svg[\s>]/i.test(c) || /^<\?xml[^>]*>\s*<svg[\s>]/i.test(c)) return 'svg';
  if (/<(!doctype html|html[\s>]|head[\s>]|body[\s>])/i.test(c) || (/^```html/i.test(c))) return 'html';
  return 'code';
}

function stripFence(raw: string): string {
  const m = raw.trim().match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?\s*```$/);
  return m ? m[1] : raw;
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({
  isOpen,
  onClose,
  content,
  kind,
  onChangeContent
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'editor'>('preview');
  const mermaidRef = useRef<HTMLDivElement>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);

  const effectiveKind: CanvasKind = kind || detectCanvasKind(content);
  const cleanContent = useMemo(() => stripFence(content), [content]);

  // Mermaid live rendering (lazy-loaded, same pattern as RichMarkdown)
  useEffect(() => {
    if (!isOpen || activeTab !== 'preview' || effectiveKind !== 'mermaid') return;
    let cancelled = false;
    setMermaidError(null);
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Cairo, sans-serif' });
        const { svg } = await mermaid.render(`canvas-mm-${Date.now()}`, cleanContent);
        if (!cancelled && mermaidRef.current) {
          mermaidRef.current.innerHTML = svg;
        }
      } catch (e: any) {
        if (!cancelled) setMermaidError(String(e?.message || e).slice(0, 200));
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, activeTab, effectiveKind, cleanContent]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanContent).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const extMap: Record<CanvasKind, string> = { html: 'html', svg: 'svg', mermaid: 'mmd', code: 'txt', text: 'txt' };
  const mimeMap: Record<CanvasKind, string> = {
    html: 'text/html', svg: 'image/svg+xml', mermaid: 'text/plain', code: 'text/plain', text: 'text/plain'
  };

  const handleDownload = () => {
    const blob = new Blob([cleanContent], { type: `${mimeMap[effectiveKind]};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mijlai-canvas.${extMap[effectiveKind]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const iframeDoc = useMemo(() => {
    if (effectiveKind === 'html') return cleanContent;
    if (effectiveKind === 'svg') {
      return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}svg{max-width:100%;height:auto}</style></head><body>${cleanContent}</body></html>`;
    }
    return '';
  }, [effectiveKind, cleanContent]);

  const canLivePreview = effectiveKind === 'html' || effectiveKind === 'svg' || effectiveKind === 'mermaid';

  return (
    <div className="w-full md:w-[480px] lg:w-[560px] h-full bg-white border-l border-slate-200 shadow-xl flex flex-col z-40 relative" role="complementary" aria-label="لوحة Canvas">
      {/* Canvas Top Bar */}
      <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <FileCode className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-sm text-slate-800">MijlAi Canvas</span>
          {canLivePreview && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {effectiveKind === 'html' ? 'HTML حي' : effectiveKind === 'svg' ? 'SVG' : 'مخطط Mermaid'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-200 p-0.5 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                activeTab === 'preview' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              معاينة حية
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                activeTab === 'editor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              الكود
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
            title="نسخ المحتوى"
            aria-label="نسخ المحتوى"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
            title={`تحميل كملف .${extMap[effectiveKind]}`}
            aria-label="تحميل كملف"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
            aria-label="إغلاق اللوحة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Body */}
      <div className="flex-1 overflow-hidden p-4 bg-slate-50">
        {activeTab === 'editor' ? (
          <textarea
            value={content}
            onChange={(e) => onChangeContent && onChangeContent(e.target.value)}
            placeholder="اكتب أو الصق الكود والأفكار هنا لتطويرها في Canvas..."
            className="w-full h-full p-4 bg-slate-900 text-slate-100 font-mono text-xs md:text-sm rounded-2xl outline-none resize-none leading-relaxed"
            dir="ltr"
            aria-label="محرر الكود"
          />
        ) : effectiveKind === 'html' || effectiveKind === 'svg' ? (
          /* Sandboxed execution: scripts run inside an isolated origin (no
             same-origin, no storage, no top navigation). */
          <iframe
            title="معاينة Artifact حية"
            sandbox="allow-scripts"
            srcDoc={iframeDoc}
            className="w-full h-full bg-white rounded-2xl border border-slate-200 shadow-inner"
          />
        ) : effectiveKind === 'mermaid' ? (
          <div className="w-full h-full bg-white rounded-2xl border border-slate-200 overflow-auto p-4" dir="ltr">
            {mermaidError ? (
              <div className="text-red-600 text-xs font-mono whitespace-pre-wrap" dir="auto">خطأ في المخطط: {mermaidError}</div>
            ) : (
              <div ref={mermaidRef} className="flex justify-center" />
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-white border border-slate-200 rounded-2xl p-4 overflow-auto text-sm text-slate-800 whitespace-pre-wrap leading-relaxed" dir="auto">
            {cleanContent || <span className="text-slate-400">لا يوجد محتوى للمعاينة حالياً</span>}
          </div>
        )}
      </div>
    </div>
  );
};
