/**
 * Streaming Prediction / Suggestion Engine
 * Provides 2-3 smart completion suggestions while the user is typing.
 * Lightweight client-side heuristics (no per-keystroke network calls):
 *  - Prefix phrase bank (Arabic/English common openings)
 *  - Word-level stem matching from a curated vocabulary
 *  - Templated completions for common task intents
 */

interface Suggestion {
  text: string;
  reason: string;
}

// Common Arabic & English prompt openings with natural completions
const PREFIX_BANK: Array<{ prefix: string; completion: string; reason: string }> = [
  { prefix: 'اشرح', completion: 'لي بأسلوب بسيط مع أمثلة عملية.', reason: 'طلب شرح' },
  { prefix: 'اكتب', completion: 'كوداً نظيفاً منسقاً مع شرح كل جزء.', reason: 'كتابة كود' },
  { prefix: 'لخص', completion: 'هذا النص في نقاط أساسية واضحة وموجزة.', reason: 'تلخيص' },
  { prefix: 'ترجم', completion: 'هذه الجملة إلى العربية مع تحسين الصياغة.', reason: 'ترجمة' },
  { prefix: 'قارن', completion: 'بين الخيارات في جدول منظم مع المميزات والعيوب.', reason: 'مقارنة' },
  { prefix: 'ماذا', completion: 'تعني هذه المصطلحات وما الفرق بينها؟', reason: 'سؤال معرفي' },
  { prefix: 'كيف', completion: 'أبدأ بالتعلم وأرتب خطة خطوة بخطوة؟', reason: 'خطة تعلم' },
  { prefix: 'اكتب', completion: 'قصة قصيرة مؤثرة بالعربية الفصحى.', reason: 'كتابة أدبية' },
  { prefix: 'حل', completion: 'هذه المسألة بالتفصيل مع شرح كل خطوة.', reason: 'حل مسألة' },
  { prefix: 'اقترح', completion: 'أفكاراً إبداعية مع المميزات والتنفيذ.', reason: 'اقتراح' },
  { prefix: 'أعطني', completion: 'أمثلة واقعية من الحياة اليومية.', reason: 'أمثلة' },
  { prefix: 'صمم', completion: 'مخططاً واضحاً لبنية المشروع.', reason: 'تصميم' },
  { prefix: 'ابحث', completion: 'عن معلومات موثوقة وحدّثة حول هذا الموضوع.', reason: 'بحث' },
  { prefix: 'Write', completion: 'a clean, well-documented function with examples.', reason: 'Write code' },
  { prefix: 'Explain', completion: 'this concept in simple terms with real-world examples.', reason: 'Explain' },
  { prefix: 'Summarize', completion: 'this text into key bullet points.', reason: 'Summarize' },
  { prefix: 'Compare', completion: 'these options in a structured table.', reason: 'Compare' },
  { prefix: 'What', completion: 'is the best approach for this and why?', reason: 'Question' },
  { prefix: 'How', completion: 'do I get started with this step by step?', reason: 'How-to' },
  { prefix: 'Fix', completion: 'the bug and explain what was wrong.', reason: 'Fix bug' },
  { prefix: 'Refactor', completion: 'this code to be cleaner and more maintainable.', reason: 'Refactor' },
];

// Word-level vocabulary for completing a partially typed last word (Arabic + technical English)
const WORD_SUGGESTIONS: Array<{ stem: string; word: string; reason: string }> = [
  { stem: 'شرح', word: 'اشرح لي بالتفصيل', reason: 'طلب شرح' },
  { stem: 'كود', word: 'اكتب كود JavaScript', reason: 'كتابة كود' },
  { stem: 'برم', word: 'برمجة Python للمبتدئين', reason: 'برمجة' },
  { stem: 'تلخ', word: 'لخص النص التالي', reason: 'تلخيص' },
  { stem: 'ترجم', word: 'ترجم هذا النص', reason: 'ترجمة' },
  { stem: 'مقار', word: 'قارن بين الخيارات', reason: 'مقارنة' },
  { stem: 'bug', word: 'bug في هذا الكود', reason: 'إصلاح خطأ' },
  { stem: 'func', word: 'function', reason: 'كود' },
  { stem: 'reac', word: 'React component', reason: 'React' },
  { stem: 'sql', word: 'SQL query', reason: 'استعلام' },
  { stem: 'api', word: 'API endpoint', reason: 'واجهة برمجية' },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Generate 2-3 smart completions for the current input.
 * Returns full-text suggestions (user can accept with Tab or click).
 */
export function generateCompletions(input: string): Suggestion[] {
  const clean = input.trim();
  if (!clean) return [];

  const normalized = normalize(clean);
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (text: string, reason: string) => {
    if (seen.has(text) || text === clean) return;
    seen.add(text);
    suggestions.push({ text, reason });
  };

  // 1. Prefix-phrase bank match (input is a short opening)
  if (normalized.length < 40) {
    for (const entry of PREFIX_BANK) {
      const normalizedPrefix = normalize(entry.prefix);
      if (normalized === normalizedPrefix || normalized.startsWith(normalizedPrefix)) {
        push(`${clean} ${entry.completion}`.trim(), entry.reason);
        if (suggestions.length >= 3) return suggestions;
      }
    }
  }

  // 2. Word-stem completion of the last token
  const words = clean.split(/\s+/);
  const lastWord = words[words.length - 1];
  const lastStem = normalize(lastWord);
  if (lastStem.length >= 2) {
    for (const entry of WORD_SUGGESTIONS) {
      if (lastStem.startsWith(entry.stem)) {
        const rest = words.slice(0, -1).join(' ');
        const candidate = rest ? `${rest} ${entry.word}` : entry.word;
        push(candidate, entry.reason);
        if (suggestions.length >= 3) return suggestions;
      }
    }
  }

  // 3. Generic smart completions for longer prompts (task-oriented)
  if (normalized.length >= 15 && suggestions.length < 3) {
    const generic: Array<[string, string]> = [
      ['وذلك مع تقديم أمثلة عملية وشرح مفصل لكل خطوة.', 'إثراء الإجابة'],
      ['مع جدول مقارنة وملخص في نهاية الإجابة.', 'تنظيم الإجابة'],
      ['واشرح النقاط الرئيسية باختصار في الختام.', 'خلاصة واضحة'],
    ];
    for (const [text, reason] of generic) {
      push(`${clean} ${text}`, reason);
      if (suggestions.length >= 3) return suggestions;
    }
  }

  return suggestions;
}