import React, { useState } from 'react';
import { X, Play, Copy, Check, Download, FileCode } from 'lucide-react';

interface CanvasPanelProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onChangeContent?: (val: string) => void;
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({
  isOpen,
  onClose,
  content,
  onChangeContent
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mijlai-canvas-document.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full md:w-[480px] lg:w-[560px] h-full bg-white border-l border-slate-200 shadow-xl flex flex-col z-40 relative">
      {/* Canvas Top Bar */}
      <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <FileCode className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-sm text-slate-800">Mijlai Canvas</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-200 p-0.5 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'editor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              محرر Text/Code
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'preview' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              معاينة Live
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
            title="نسخ المحتوى"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
            title="تحميل كملف"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Body */}
      <div className="flex-1 overflow-hidden p-4">
        {activeTab === 'editor' ? (
          <textarea
            value={content}
            onChange={(e) => onChangeContent && onChangeContent(e.target.value)}
            placeholder="اكتب أو الصق الكود والأفكار هنا لتطويرها في Canvas..."
            className="w-full h-full p-4 bg-slate-900 text-slate-100 font-mono text-xs md:text-sm rounded-2xl outline-none resize-none leading-relaxed"
          />
        ) : (
          <div className="w-full h-full bg-slate-50 border border-slate-200 rounded-2xl p-4 overflow-auto text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {content || <span className="text-slate-400">لا يوجد محتوى للمعاينة حالياً</span>}
          </div>
        )}
      </div>
    </div>
  );
};
