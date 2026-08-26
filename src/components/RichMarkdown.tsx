import React, { useEffect, useMemo, useRef } from 'react';
import hljs from 'highlight.js/lib/common';
import { renderSanitizedMarkdown } from '../utils/sanitizer';
import { copyText } from '../utils/clipboard';

// Lazy singleton for mermaid — it's ~700KB minified, so it is only imported
// when a message actually contains a diagram (keeps first paint fast).
type MermaidApi = typeof import('mermaid')['default'];
let mermaidLoader: Promise<MermaidApi> | null = null;
function getMermaid(): Promise<MermaidApi> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        fontFamily: 'Cairo, "Plus Jakarta Sans", sans-serif',
        themeVariables: {
          fontFamily: 'Cairo, "Plus Jakarta Sans", sans-serif'
        }
      });
      return mod.default;
    });
  }
  return mermaidLoader;
}

interface RichMarkdownProps {
  content: string;
  isStreaming?: boolean;
  isUser?: boolean;
  onRunPython?: (code: string, blockIndex: number) => void;
  /** Open an artifact code block (html/svg/mermaid) in the live Canvas panel. */
  onOpenCanvas?: (code: string, language: string) => void;
}

export const RichMarkdown: React.FC<RichMarkdownProps> = React.memo(({ content, isStreaming, isUser, onRunPython, onOpenCanvas }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => renderSanitizedMarkdown(content), [content]);

  // Post-process: syntax highlight + mermaid + copy buttons
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Syntax highlighting for code blocks (skip mermaid containers)
    const codeBlocks = container.querySelectorAll<HTMLElement>('pre code[class*="language-"]');
    codeBlocks.forEach((el) => {
      try {
        hljs.highlightElement(el);
      } catch {
        /* fallback to plain text */
      }
    });

    // 2. Mermaid diagram rendering (only when not streaming, avoid partial-syntax flashes)
    if (!isStreaming) {
      const mermaidEls = Array.from(container.querySelectorAll<HTMLElement>('.mermaid'));
      if (mermaidEls.length > 0) {
        getMermaid()
          .then((mermaid) => mermaid.run({ nodes: mermaidEls as HTMLElement[] }))
          .catch((err) => {
            console.warn('Mermaid render error:', err);
          });
      }
    }

    // 3. Code copy buttons
    const copyButtons = container.querySelectorAll<HTMLButtonElement>('.code-copy-btn');
    copyButtons.forEach((btn) => {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.code-block-wrap');
        const codeEl = wrap?.querySelector('code');
        const text = codeEl?.textContent || '';
        copyText(text).then((ok) => {
          if (!ok) return;
          const old = btn.innerHTML;
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerHTML = old;
            btn.classList.remove('copied');
          }, 1600);
        });
      });
    });

    // 3.5 Canvas open buttons for renderable artifacts (html/svg/mermaid)
    if (onOpenCanvas && !isStreaming) {
      const artifactBlocks = container.querySelectorAll<HTMLElement>(
        'pre code.language-html, pre code.language-xml, pre code.language-svg, pre.language-mermaid code, pre code.language-mermaid'
      );
      artifactBlocks.forEach((el) => {
        const wrap = el.closest('.code-block-wrap');
        const head = wrap?.querySelector('.code-block-head');
        if (!head || head.querySelector('.code-canvas-btn')) return;
        const langMatch = (el.className.match(/language-(\w+)/) || [])[1] || '';
        const btn = document.createElement('button');
        btn.className = 'code-run-btn code-canvas-btn';
        btn.type = 'button';
        btn.title = 'فتح في لوحة Canvas التفاعلية';
        btn.innerHTML = '⧉ Canvas';
        btn.addEventListener('click', () => onOpenCanvas(el.textContent || '', langMatch));
        head.appendChild(btn);
      });
    }

    // 4. Python run buttons (agentic code execution)
    const pythonBlocks = container.querySelectorAll<HTMLElement>('pre code.language-python');
    pythonBlocks.forEach((el, idx) => {
      if (!onRunPython || isStreaming) return;
      const wrap = el.closest('.code-block-wrap');
      const head = wrap?.querySelector('.code-block-head');
      if (!head || head.querySelector('.code-run-btn')) return;

      const runBtn = document.createElement('button');
      runBtn.className = 'code-run-btn';
      runBtn.type = 'button';
      runBtn.title = 'تشغيل في مساحة عمل بايثون';
      runBtn.innerHTML = '▶ تشغيل';
      runBtn.addEventListener('click', () => {
        runBtn.classList.add('running');
        runBtn.innerHTML = '… يعمل';
        onRunPython(el.textContent || '', idx);
        setTimeout(() => {
          runBtn.classList.remove('running');
          runBtn.innerHTML = '▶ تشغيل';
        }, 15000);
      });
      head.appendChild(runBtn);
    });
  }, [html, isStreaming, onRunPython, onOpenCanvas]);

  return (
    <div
      ref={containerRef}
      dir="auto"
      className="markdown-body"
      style={{
        color: isUser ? '#fff' : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

RichMarkdown.displayName = 'RichMarkdown';