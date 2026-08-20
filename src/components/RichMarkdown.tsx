import React, { useEffect, useMemo, useRef } from 'react';
import hljs from 'highlight.js/lib/common';
import mermaid from 'mermaid';
import { renderSanitizedMarkdown } from '../utils/sanitizer';

// Initialize mermaid once (lazy render via run())
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'Cairo, "Plus Jakarta Sans", sans-serif',
  themeVariables: {
    fontFamily: 'Cairo, "Plus Jakarta Sans", sans-serif'
  }
});

interface RichMarkdownProps {
  content: string;
  isStreaming?: boolean;
  isUser?: boolean;
}

export const RichMarkdown: React.FC<RichMarkdownProps> = React.memo(({ content, isStreaming, isUser }) => {
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
        mermaid.run({ nodes: mermaidEls as HTMLElement[] }).catch((err) => {
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
        navigator.clipboard.writeText(text).then(() => {
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
  }, [html, isStreaming]);

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