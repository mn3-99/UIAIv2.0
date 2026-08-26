// Heuristic Arabic follow-up suggestions generated from the last exchange.
// Zero-latency (no extra LLM round-trip) yet tailored to the answer shape:
// code answers get code follow-ups, comparisons get summary follow-ups, etc.

const MAX_LABEL = 64;

function trim(s: string): string {
  return s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1).trim() + '…' : s;
}

const LEADING_VERBS =
  /^(اشرح|ما هو|ما هي|ماهو|ماهي|كيف|اكتب|صغ|صيغ|ترجم|لماذا|أخبرني عن|حدثني عن|قل لي عن|أريد|أرجو|من فضلك)\s+/;

export function generateFollowUps(userText: string, assistantText: string): string[] {
  const rawTopic = userText
    .replace(/[؟?.!،,]+$/g, '')
    .replace(LEADING_VERBS, '')
    .replace(/\s+/g, ' ')
    .trim();
  const topic = trim(rawTopic || 'هذا الموضوع');
  const suggestions: string[] = [];

  const hasCode = /```/.test(assistantText);
  const hasTable = /\|.*\|/.test(assistantText);
  const hasList = /(^|\n)\s*([-*•]|\d+\.)\s/.test(assistantText);

  if (hasCode) {
    suggestions.push('اشرح هذا الكود سطراً بسطر');
    suggestions.push('أضف معالجة أخطاء وحالات حدّية للكود');
    suggestions.push('اكتب اختبارات وحدة لهذا الكود');
  } else if (hasTable || hasList) {
    suggestions.push(`لخّص أهم النقاط عن ${topic} في 3 نقاط`);
    suggestions.push(`أعطني مثالاً عملياً على ${topic}`);
    suggestions.push(`ما أفضل الممارسات المتعلقة بـ${topic}؟`);
  } else {
    suggestions.push(`أعطني مثالاً عملياً على ${topic}`);
    suggestions.push(`لخّص ${topic} في نقاط واضحة ومختصرة`);
    suggestions.push(`ما عيوب أو مخاطر ${topic}؟`);
  }

  // A deeper-dive chip is always a natural next step
  suggestions.push('وسّع النقطة الأخيرة بمزيد من التفصيل');

  return Array.from(new Set(suggestions))
    .filter((s) => s.length > 8)
    .slice(0, 4);
}
