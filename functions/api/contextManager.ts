/**
 * Context & Multimodal Memory (Area 3)
 * =====================================================
 * - Sliding Window: نُبقي آخر N رسالة كما هي، ونلخّص القديم تلقائياً (Context Compression)
 *   مع تخزين الملخّص في كاش لكل محادثة — هذا هو "Prompt Caching" للجلسات الطويلة
 *   (لا نعيد التلخيص كل طلب، بل عند تغيّر نافذة الرسائل فقط).
 * - Entity / Anaphora: تتبّع خفيف للكيانات وحل الإحالات (هذا/تلك/السابق) بالربط
 *   مع آخر عنصر وسائط أو كيانات الحوار الأخيرة.
 * - Media memory: نتذكّر الصور المولّدة/المرفوعة (البذرة seed + الوصف + الرابط) لكل محادثة
 *   لتمكين التعديل التراكمي: «عدّل الصورة السابقة».
 */

interface SummarizedConv {
  summary: string;
  updatedAt: number;
  signature: string;
}

export interface MediaItem {
  url: string;
  prompt: string;
  model: string;
  seed?: number | string;
  provider?: string;
  createdAt: number;
}

const summaryCache = new Map<string, SummarizedConv>();
const mediaMemory = new Map<string, MediaItem[]>();

const WINDOW = 12; // عدد الرسائل المحفوظة كما هي قبل التلخيص

const STOPWORDS = new Set([
  'هذا', 'هذه', 'ذلك', 'تلك', 'هو', 'هي', 'نحن', 'هم', 'انت', 'انتي', 'أنت', 'أنتم',
  'with', 'this', 'that', 'from', 'your', 'when', 'what', 'which', 'their', 'about', 'have',
  'make', 'image', 'الصورة', 'صورة', 'من', 'إلى', 'على', 'في', 'ما', 'كيف', 'هل', 'لماذا',
]);

function signatureOf(msgs: any[]): string {
  return `${(msgs[0]?.id || 'x')}:${(msgs[msgs.length - 1]?.id || 'y')}:${msgs.length}`;
}

function firstWords(text: string, n = 160): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, n);
}

function extractiveSummary(msgs: any[]): string {
  const lines = msgs.map((m) => {
    const role =
      m.role === 'user' ? 'المستخدم'
      : m.role === 'assistant' ? 'المساعد'
      : m.role === 'system' ? 'النظام'
      : m.role;
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    return `- ${role}: ${firstWords(text, 160)}`;
  });
  return lines.join('\n');
}

function extractEntities(msgs: any[]): string[] {
  const ents = new Set<string>();
  for (const m of msgs.slice(-6)) {
    const text = typeof m.content === 'string' ? m.content : '';
    const quoted = text.match(/["«"]([^"»"]{2,40})["»"]/g) || [];
    quoted.forEach((q) => ents.add(q.replace(/["«»]/g, '').trim()));
    const words = text.match(/[A-Za-z\u0600-\u06FF]{4,}/g) || [];
    words.slice(0, 14).forEach((w) => {
      const lw = w.toLowerCase();
      if (!STOPWORDS.has(lw)) ents.add(w);
    });
  }
  return [...ents].slice(0, 12);
}

function buildMediaHint(media: MediaItem): any {
  return {
    role: 'system',
    content:
      `[ذاكرة الوسائط] آخر صورة مولّدة/معروضة: الوصف «${media.prompt}»، النموذج ${media.model}` +
      `${media.seed != null ? `، البذرة ${media.seed}` : ''}، الرابط ${media.url}. ` +
      `عند طلب تعديل «الصورة السابقة/هذه» استخدم هذا الوصف والبذرة كمرجع للتعديل التراكمي.`,
    _mediaHint: true,
  };
}

export interface CompressOptions {
  window?: number;
  chatId?: string;
}

export function compressMessages(messages: any[], chatId?: string, opts: CompressOptions = {}): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const window = opts.window || WINDOW;
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const convo = messages.filter((m) => m.role !== 'system');

  if (convo.length <= window) {
    const media = chatId ? getMediaContext(chatId) : undefined;
    if (media) return [...systemMsgs, buildMediaHint(media), ...convo];
    return messages;
  }

  const keep = convo.slice(-window);
  const old = convo.slice(0, -window);

  let summary: string | undefined;
  const sig = signatureOf(old);
  const cached = chatId ? summaryCache.get(chatId) : undefined;
  if (cached && cached.signature === sig) {
    summary = cached.summary;
  } else {
    summary = extractiveSummary(old);
    if (chatId) summaryCache.set(chatId, { summary, updatedAt: Date.now(), signature: sig });
  }

  const parts = ['[ملخّص المحادثة السابقة — ضغط السياق لتقليل الزمن والتكلفة]:', summary];
  const ents = extractEntities(convo);
  if (ents.length) parts.push('', `كيانات حديثة في الحوار (لحل الإحالات والضمائر): ${ents.join('، ')}.`);
  const media = chatId ? getMediaContext(chatId) : undefined;
  if (media) parts.push('', buildMediaHint(media).content);

  const ctxMsg = { role: 'system', content: parts.join('\n'), _compressed: true };
  return [...systemMsgs, ctxMsg, ...keep];
}

export function recordMedia(chatId: string, item: MediaItem): void {
  const arr = mediaMemory.get(chatId) || [];
  arr.push(item);
  mediaMemory.set(chatId, arr.slice(-20));
}

export function getMediaContext(chatId: string): MediaItem | undefined {
  const arr = mediaMemory.get(chatId);
  return arr && arr.length ? arr[arr.length - 1] : undefined;
}

export function listMedia(chatId: string): MediaItem[] {
  return mediaMemory.get(chatId) || [];
}

export function clearContext(chatId?: string): void {
  if (!chatId) {
    summaryCache.clear();
    mediaMemory.clear();
    return;
  }
  summaryCache.delete(chatId);
  mediaMemory.delete(chatId);
}
