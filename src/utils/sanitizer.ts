import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked defaults
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Cache up to 200 rendered Markdown strings for high rendering performance
const markdownCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

/**
 * Renders Markdown content into safe, sanitized HTML
 * Strictly prevents XSS injection using DOMPurify
 */
export function renderSanitizedMarkdown(markdownText: string): string {
  if (!markdownText) return '';
  
  if (markdownCache.has(markdownText)) {
    return markdownCache.get(markdownText)!;
  }

  try {
    const rawHtml = marked.parse(markdownText) as string;
    
    // Configure DOMPurify to keep essential markup and sanitize all dangerous tags/attributes
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel', 'class', 'dir'],
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
