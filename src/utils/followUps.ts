// Context-aware Arabic follow-up suggestions.
// Reads the *whole recent conversation* (not just the last turn) so a vague
// follow-up like «اشرح أكثر» inherits the real topic from earlier replies,
// then picks the most likely next user needs based on the answer shape:
// code → tests/errors/explain; factual → details/examples/compare; etc.
// Deterministic = instant + always available (no extra model round-trip).

const MAX_LABEL = 62;

function trim(s: string): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_LABEL ? t.slice(0, MAX_LABEL - 1).trim() + '…' : t;
}

const LEADING_VERBS =
  /^(اشرح|فسر|وضح|ما هو|ما هي|ماهو|ماهي|كيف|اكتب|صغ|صيغ|ترجم|لماذا|أخبرني عن|حدثني عن|قل لي عن|أريد|أرجو|من فضلك|اعطني|أعطني|قارن|لخص)\s+/;

function clean(text: string): string {
  return String(text || '')
    .replace(/[؟?.!،,؛:]+$/g, '')
    .replace(LEADING_VERBS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Is the user turn generic enough that it only makes sense as a follow-up? */
const GENERIC = /^(اشرح اكثر|وضح اكثر|اوسع|وسع|اكمل|تابع|مثال|اوضح|هذا|ذلك|لها|له|لهم|بمزيد|اكثر|اسهاب)\b/;
const PRONOUN_REF = /\b(هذا|هذه|ذلك|تلك|السابق|السابقة|لها|له|لهم|بها|به|عنه|عنها|فهي|وهي|وهو|أنت)\b/;

export interface FollowUpContext { role: string; content: string }

export function generateFollowUps(
  userText: string,
  assistantText: string,
  context: Array<FollowUpContext | string> = [],
): string[] {
  let user = String(userText || '').trim();
  let assistant = String(assistantText || '');

  // ── Inherit the real topic from earlier turns when the current one is a
  //    vague/pronoun follow-up («اشرح أكثر» / «مثال على ذلك»).
  let inheritedTopic = '';
  let previousAssistant = '';
  const tail = (Array.isArray(context) ? context : []).slice(-6);
  for (let i = tail.length - 1; i >= 0; i--) {
    const c = tail[i];
    const content = typeof c === 'string' ? c : c?.content || '';
    const role = typeof c === 'string' ? '' : c?.role || '';
    if (role === 'assistant' && !previousAssistant) previousAssistant = content;
  }

  const generic = GENERIC.test(user) || (user.length < 14 && PRONOUN_REF.test(user) && !!previousAssistant);
  if (generic && previousAssistant) {
    const firstSentence = (previousAssistant.match(/[^.!?؟\n]{12,}/g) || [])[0] || previousAssistant;
    inheritedTopic = trim(clean(firstSentence).slice(0, 90));
  }

  let topic = clean(user);
  if (!topic || generic) topic = inheritedTopic || 'هذا الموضوع';
  const topicT = trim(topic || 'هذا الموضوع');

  const suggestions: string[] = [];
  const hasCode = /```/.test(assistant);
  const hasTable = /\|.*\|/.test(assistant);
  const hasList = /(^|\n)\s*([-*•]|\d+\.)\s/.test(assistant);
  const hasUrl = /https?:\/\//.test(assistant);
  const hasNumbers = /\b\d+(\.\d+)?\s*(%|مليون|مليار|ألف|درجة|ريال|دولار|دينار|كم)?\b/.test(assistant);
  const askedWhy = /(لماذا|ما السبب|سبب)/.test(user);
  const askedHow = /(كيف|كيفية|طريقة|خطوات)/.test(user);
  const askedCompare = /(قارن|الفرق|مقارنة|أفضل|vs|فرق)/.test(user);
  const askedWhoWhat = /(من هو|من هي|ما هو|ما هي|متى|اين|أين|كم عدد)/.test(user);

  // Tailor to the *kind* of content the assistant just produced.
  if (hasCode) {
    suggestions.push('اشرح هذا الكود سطراً بسطر');
    suggestions.push('أضف معالجة أخطاء وحالات حدّية للكود');
    suggestions.push('اكتب اختبارات وحدة لهذا الكود');
    if (hasUrl) suggestions.push('ما أفضل الممارسات والأمان في هذا الكود؟');
  } else if (hasTable || hasList) {
    suggestions.push(`لخّص أهم النقاط عن ${topicT} في 3 نقاط`);
    suggestions.push(`أعطني مثالاً عملياً على ${topicT}`);
    suggestions.push(`قارن ${topicT} ببديل شائع آخر`);
  } else if (askedCompare) {
    suggestions.push(`لخّص مقارنتك في جدول واضح`);
    suggestions.push(`متى تختار الخيار الأول ومتى الثاني؟`);
    suggestions.push(`هل هناك معايير أداء أو تكلفة يجب مراعاتها؟`);
  } else if (askedWhy || askedHow) {
    suggestions.push(`أعطني مثالاً عملياً خطوة بخطوة عن ${topicT}`);
    suggestions.push(`ما الأخطاء أو المشاكل الشائعة في ${topicT}؟`);
    suggestions.push(`هل يمكن تبسيط ${topicT} أكثر مع تشبيه من الحياة؟`);
  } else if (askedWhoWhat || hasNumbers) {
    suggestions.push(`ما مصادر أو مراجع موثوقة عن ${topicT}؟`);
    suggestions.push(`قارن الأرقام/المعلومات أعلاه ببيانات أحدث أو مختلفة`);
    suggestions.push(`اشرح بمزيد من التفاصيل عن ${topicT}`);
  } else {
    suggestions.push(`أعطني مثالاً عملياً على ${topicT}`);
    suggestions.push(`لخّص ${topicT} في نقاط واضحة ومختصرة`);
    suggestions.push(`ما عيوب أو مخاطر ${topicT}؟`);
  }

  // Universal, context-aware next steps that almost always feel natural.
  if (inheritedTopic) suggestions.push('لخّص ما قلته من البداية حتى الآن في نقاط مرتبة');
  suggestions.push('وسّع النقطة الأخيرة بمزيد من التفصيل');
  if (hasUrl || hasNumbers) suggestions.push('أعطني نسخة أبسط موجهة لمبتدئ');

  return Array.from(new Set(suggestions))
    .map((s) => s.replace(/\s{2,}/g, ' '))
    .filter((s) => s.length > 8)
    .slice(0, 4);
}
