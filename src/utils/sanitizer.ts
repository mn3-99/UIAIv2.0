import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

// Configure marked defaults
marked.setOptions({
  gfm: true,
  breaks: true,
});

// ==========================================
// Custom Marked Renderer: Mermaid + code blocks
// ==========================================
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }): string {
      const language = (lang || '').match(/^\S*/)?.[0]?.toLowerCase() || '';
      const esc = escapeHtml(text);

      if (language === 'mermaid') {
        return `<div class="mermaid-wrap"><pre class="mermaid-pre"><div class="mermaid">${esc}</div></pre></div>`;
      }

      const langClass = language ? ` class="language-${escapeHtml(language)}"` : '';
      const langLabel = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : '<span class="code-lang">code</span>';
      return `<div class="code-block-wrap"><div class="code-block-head"><span class="code-dots"><i></i><i></i><i></i></span>${langLabel}<button class="code-copy-btn" type="button" title="نسخ الكود"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button></div><pre class="code-block"><code${langClass}>${esc}</code></pre></div>`;
    }
  }
});

// ==========================================
// Math (KaTeX) pre-processing:
//  $$...$$  -> block math
//  $...$    -> inline math
// Extracted before marked to protect from markdown mangling, then
// rendered to KaTeX HTML after marked (safe with throwOnError:false).
// ==========================================
interface MathToken {
  expr: string;
  display: boolean;
}

function extractMath(markdown: string): { text: string; tokens: MathToken[] } {
  const tokens: MathToken[] = [];
  const replacer = (display: boolean) => (_full: string, expr: string) => {
    const idx = tokens.length;
    tokens.push({ expr, display });
    return `\u0001MATH${idx}\u0001`;
  };

  // Block math first ($$...$$)
  let text = markdown.replace(/\$\$([\s\S]+?)\$\$/g, replacer(true));
  // Inline math ($...$)
  text = text.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, replacer(false));

  return { text, tokens };
}

function restoreMath(html: string, tokens: MathToken[]): string {
  return html.replace(/\u0001MATH(\d+)\u0001/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    const token = tokens[idx];
    if (!token) return '';
    try {
      return katex.renderToString(token.expr, {
        displayMode: token.display,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return `<code>${escapeHtml(token.expr)}</code>`;
    }
  });
}

// Cache up to 200 rendered Markdown strings for high rendering performance
const markdownCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

/**
 * Renders Markdown into safe, sanitized HTML with:
 *  - Syntax highlighting classes (applied by RichMarkdown via highlight.js)
 *  - Mermaid diagram containers (rendered by RichMarkdown via mermaid.js)
 *  - KaTeX math rendering
 */
export function renderSanitizedMarkdown(markdownText: string): string {
  if (!markdownText) return '';

  if (markdownCache.has(markdownText)) {
    return markdownCache.get(markdownText)!;
  }

  try {
    const { text, tokens } = extractMath(markdownText);
    const rawHtml = marked.parse(text) as string;
    const htmlWithMath = restoreMath(rawHtml, tokens);

    // Configure DOMPurify to keep essential markup and sanitize all dangerous tags/attributes
    const cleanHtml = DOMPurify.sanitize(htmlWithMath, {
      ADD_ATTR: ['target', 'rel', 'class', 'dir', 'title'],
      ADD_TAGS: [
        'mjx-container', 'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub',
        'mfrac', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'mo', 'annotation', 'semantics'
      ],
      FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed', 'input']
    });

    if (markdownCache.size >= MAX_CACHE_SIZE) {
      const firstKey = markdownCache.keys().next().value;
      if (firstKey) markdownCache.delete(firstKey);
    }
    markdownCache.set(markdownText, cleanHtml);

    return cleanHtml;
  } catch (err) {
    console.error('Markdown rendering error:', err);
    return DOMPurify.sanitize(markdownText);
  }
}

/**
 * Simple text extraction for copy without HTML
 */
export function stripHtml(html: string): string {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}