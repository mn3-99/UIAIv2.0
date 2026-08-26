/**
 * Skills & Plugins Registry — سجل المهارات والإضافات
 * =====================================================
 * مصدر الاستيراد: توثيق Kimi الرسمي (kimi.com/help/features/plugins)
 * - المهارة (Skill): حزمة معرفة/خطوات تُحقن كتعليمات أسلوب عند الإرسال (قابلة للتنفيذ فعلياً).
 * - الإضافة (Plugin): موصّل أداة حقيقية موجودة في النظام (بحث، صور، TTS، MCP...).
 *
 * العناصر المرفوضة موثقة بأسبابها في REJECTED_IMPORTS (لا OAuth/مدفوعة/مكررة).
 */

export type SkillType = 'skill' | 'plugin';
export type PluginAction = 'web_search' | 'image_gen' | 'tts' | 'mcp_fetch' | 'mcp_filesystem' | 'mcp_memory';

export interface SkillInputField {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface SkillSchema {
  input_schema: Record<string, SkillInputField>;
  execution_logic: string;
  output_criteria: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  icon: string;
  category: string;
  type: SkillType;
  source: 'kimi-import' | 'builtin' | 'generated';
  enabled: boolean;
  /** المهارات: تعليمات تُحقن مع الطلب */
  promptPack?: string;
  /** الإضافات: الأداة الحقيقية المرتبطة */
  action?: PluginAction;
  /** مخطط المهارات المولّدة (صانع المهارات) */
  schema?: SkillSchema;
  /** تعليمه تلقائياً عند فشل اختبار الضغط */
  reliable: boolean;
}

// ─────────────────────────────────────────────────────────────
// المهارات المستوردة/المضمنة (Prompt Packs — تنفيذ فعلي عبر الحقن)
// ─────────────────────────────────────────────────────────────
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'translator', name: 'مترجم محترف', nameEn: 'Translator', type: 'skill',
    desc: 'ترجمة دقيقة بين العربية و40+ لغة مع الحفاظ على السياق والمصطلحات',
    icon: 'Languages', category: 'إنتاجية', source: 'kimi-import', enabled: false, reliable: true,
    promptPack: 'أنت مترجم محترف. ترجم نص المستخدم ترجمة دقيقة تحفظ المعنى والسياق والمصطلحات التقنية. إن كان النص عربياً ترجمه للإنجليزية والعكس، ولغير ذلك حدد اللغة المطلوبة من سياق الطلب. أخرج الترجمة فقط دون شرح إلا إذا طُلب.'
  },
  {
    id: 'summarizer', name: 'التلخيص الذكي', nameEn: 'Summarizer', type: 'skill',
    desc: 'تلخيص النصوص الطويلة في نقاط مركزة مع خلاصة تنفيذية',
    icon: 'ListMinus', category: 'إنتاجية', source: 'kimi-import', enabled: false, reliable: true,
    promptPack: 'لخّص محتوى المستخدم في نقاط أساسية مرتبة (5-8 نقاط كحد أقصى) ثم خلاصة تنفيذية من سطرين. حافظ على الأرقام والحقائق المهمة ولا تضف معلومات من عندك.'
  },
  {
    id: 'code-reviewer', name: 'مراجع الكود', nameEn: 'Code Reviewer', type: 'skill',
    desc: 'مراجعة احترافية: الأخطاء، الأداء، الأمان، وأفضل الممارسات',
    icon: 'Code2', category: 'تطوير', source: 'builtin', enabled: false, reliable: true,
    promptPack: 'راجع كود المستخدم كمراجع أول: حدد الأخطاء المنطقية، مشاكل الأداء، الثغرات الأمنية، وانتهاكات أفضل الممارسات. رتّب الملاحظات حسب الخطورة (حرج/مهم/تحسين) واقترح الإصلاح بالكود.'
  },
  {
    id: 'deep-research', name: 'البحث العميق', nameEn: 'Deep Research', type: 'skill',
    desc: 'خطة بحث متعددة المراحل مع تحليل منظم وتوثيق النقاط (مرادف Kimi Deep Research)',
    icon: 'Microscope', category: 'بحث', source: 'kimi-import', enabled: false, reliable: true,
    promptPack: 'تعامل مع طلب المستخدم كمهمة بحث عميق: 1) حلل السؤال لمحاور فرعية 2) غطِّ كل محور بمعلومات دقيقة 3) قارن وناقش وجهات النظر المختلفة 4) اختم بخلاصة وتوصيات. نظّم الإجابة بعناوين واضحة واذكر مستوى الثقة عند عدم اليقين.'
  },
  {
    id: 'slides-outline', name: 'مخطط العروض', nameEn: 'Slides Outline', type: 'skill',
    desc: 'يحوّل الموضوع إلى هيكل عرض تقديمي كامل بالشرائح والنقاط (مرادف Kimi Slides)',
    icon: 'Presentation', category: 'إبداع', source: 'kimi-import', enabled: false, reliable: true,
    promptPack: 'حوّل موضوع المستخدم إلى هيكل عرض تقديمي: شريحة عنوان، ثم 6-12 شريحة مرقمة، لكل شريحة: عنوان + 3-4 نقاط + ملاحظة للمتحدث. اجعل التسلسل منطقياً متدرجاً من المقدمة للخلاصة.'
  },
  {
    id: 'docs-writer', name: 'كاتب المستندات', nameEn: 'Docs Writer', type: 'skill',
    desc: 'صياغة مستندات وتقارير رسمية منسقة بعناوين وهيكل احترافي (مرادف Kimi Docs)',
    icon: 'FileText', category: 'إنتاجية', source: 'kimi-import', enabled: false, reliable: true,
    promptPack: 'اكتب مخرجات المستخدم كمستند رسمي: صفحة عنوان مختصرة، فهرس، أقسام مرقمة بعناوين واضحة، فقرات مترابطة بأسلوب مهني، وخاتمة بتوصيات إن لزم. استخدم تنسيق Markdown الكامل.'
  },
  {
    id: 'sheets-formula', name: 'مساعد الجداول', nameEn: 'Sheets Helper', type: 'skill',
    desc: 'صيغ Excel/Sheets معقدة وشرح خطوة بخطوة وأمثلة تطبيقية (مرادف Kimi Sheets)',
    icon: 'Table', category: 'بيانات', source: 'kimi-import', enabled: false, reliable: true,
    promptPack: 'أجب عن أسئلة الجداول بصيغ Excel/Sheets دقيقة وجاهزة للنسخ مع: شرح كل وسيطة، مثال ببيانات واقعية، وبديل أبسط إن وجد. نبّه لاختلافات الفواصل العربية/الإنجليزية عند الحاجة.'
  },
  {
    id: 'skill-builder', name: 'صانع المهارات', nameEn: 'Skill Builder', type: 'skill',
    desc: 'حوّل وصفاً موجزاً إلى مهارة كاملة قابلة للتنفيذ (مخطط JSON + تعليمات)',
    icon: 'Wand2', category: 'نظام', source: 'builtin', enabled: true, reliable: true,
  },
];

// ─────────────────────────────────────────────────────────────
// الإضافات (موصلات أدوات حقيقية موجودة في النظام)
// ─────────────────────────────────────────────────────────────
export const BUILTIN_PLUGINS: SkillDefinition[] = [
  {
    id: 'web-search', name: 'بحث الويب المباشر', nameEn: 'Web Search', type: 'plugin',
    desc: 'بحث فوري في الإنترنت ودمج النتائج في الإجابة',
    icon: 'Globe', category: 'بحث', source: 'builtin', enabled: false, reliable: true,
    action: 'web_search',
  },
  {
    id: 'image-gen', name: 'توليد الصور', nameEn: 'Image Generation', type: 'plugin',
    desc: 'تحويل الوصف النصي إلى صور (Flux) — من قائمة Kimi Creative',
    icon: 'ImageIcon', category: 'إبداع', source: 'kimi-import', enabled: true, reliable: true,
    action: 'image_gen',
  },
  {
    id: 'voice-tts', name: 'القراءة الصوتية', nameEn: 'Text-to-Speech', type: 'plugin',
    desc: 'قراءة الردود بصوت عالٍ — من قائمة Kimi Creative (Audio)',
    icon: 'Volume2', category: 'إبداع', source: 'kimi-import', enabled: true, reliable: true,
    action: 'tts',
  },
  {
    id: 'mcp-fetch', name: 'قارئ الروابط', nameEn: 'URL Fetcher', type: 'plugin',
    desc: 'جلب وقراءة محتوى صفحات الويب عبر MCP',
    icon: 'Link', category: 'تطوير', source: 'builtin', enabled: true, reliable: true,
    action: 'mcp_fetch',
  },
  {
    id: 'mcp-files', name: 'مدير الملفات', nameEn: 'Filesystem MCP', type: 'plugin',
    desc: 'قراءة وكتابة ملفات مساحة العمل عبر MCP',
    icon: 'FolderOpen', category: 'تطوير', source: 'builtin', enabled: true, reliable: true,
    action: 'mcp_filesystem',
  },
  {
    id: 'mcp-memory', name: 'الذاكرة الدائمة', nameEn: 'Memory MCP', type: 'plugin',
    desc: 'حفظ واسترجاع معلومات عبر الجلسات عبر MCP',
    icon: 'Brain', category: 'إنتاجية', source: 'builtin', enabled: true, reliable: true,
    action: 'mcp_memory',
  },
];

// ─────────────────────────────────────────────────────────────
// الاستيرادات المرفوضة من قائمة Kimi الرسمية — موثقة بالأسباب
// ─────────────────────────────────────────────────────────────
export interface RejectedImport { name: string; category: string; reason: string; }
export const REJECTED_IMPORTS: RejectedImport[] = [
  { name: 'Video Generation', category: 'إبداع', reason: 'لا يوجد backend مجاني موثوق لتوليد الفيديو في البنية الحالية (Pollinations نص/صورة فقط) — فشل شرط القيمة الفعلية' },
  { name: 'Audio Generation (music)', category: 'إبداع', reason: 'توليد موسيقى يتطلب خدمة مدفوعة؛ المتاح مجاناً هو TTS وقد استُورد كإضافة مستقلة' },
  { name: 'Notion / Canva / Baidu Netdisk / GitHub', category: 'إنتاجية/تطوير', reason: 'تتطلب OAuth بحساب المستخدم النهائي — لا يمكن تفعيلها آلياً دون تدفق تفويض لكل مستخدم' },
  { name: 'Wind / S&P / iFinD / Gildata / Stripe / Tianyancha / SEC / IMF / World Bank', category: 'مالية', reason: 'واجهات مدفوعة أو مرخّصة مؤسسياً — لا قيمة قابلة للقياس دون اشتراكات' },
  { name: 'Inspiration Pool / Vivify', category: 'عام', reason: 'وظيفة مكررة: محتواها تحققه حزم المهارات النصية المستوردة أصلاً' },
];

// ─────────────────────────────────────────────────────────────
// الحالة المحفوظة (localStorage): التفعيلات + المهارات المولّدة
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'mijlai_skills_state_v1';

interface SkillsState {
  enabledOverrides: Record<string, boolean>;
  generated: SkillDefinition[];
}

export function loadSkillsState(): SkillsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { enabledOverrides: parsed.enabledOverrides || {}, generated: Array.isArray(parsed.generated) ? parsed.generated : [] };
    }
  } catch { /* corrupted state → reset */ }
  return { enabledOverrides: {}, generated: [] };
}

export function saveSkillsState(state: SkillsState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

/** السجل الكامل: مضمّن + مولّد، مع تطبيق تفعيلات المستخدم */
export function getFullRegistry(): SkillDefinition[] {
  const state = loadSkillsState();
  const all = [...BUILTIN_SKILLS, ...BUILTIN_PLUGINS, ...state.generated];
  return all.map(item => ({
    ...item,
    enabled: state.enabledOverrides[item.id] !== undefined ? state.enabledOverrides[item.id] : item.enabled,
  }));
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  const state = loadSkillsState();
  state.enabledOverrides[id] = enabled;
  saveSkillsState(state);
}

export function addGeneratedSkill(skill: SkillDefinition): void {
  const state = loadSkillsState();
  state.generated = state.generated.filter(s => s.id !== skill.id);
  state.generated.push(skill);
  saveSkillsState(state);
}

export function removeGeneratedSkill(id: string): void {
  const state = loadSkillsState();
  state.generated = state.generated.filter(s => s.id !== id);
  delete state.enabledOverrides[id];
  saveSkillsState(state);
}

/** المهارات النشطة حالياً (تُحقن حزمها عند الإرسال) */
export function getActivePromptPacks(): string[] {
  return getFullRegistry()
    .filter(s => s.type === 'skill' && s.enabled && s.reliable && s.promptPack)
    .map(s => s.promptPack!);
}
