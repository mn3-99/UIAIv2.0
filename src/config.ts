/**
 * MijlAi — Single Source of Truth Configuration
 * All application identity values, defaults, and links originate from here.
 */

export const APP_CONFIG = {
  name: "MijlAi",
  tagline: "تطبيق دردشة ويب ذكي، خفيف وسريع للغاية",
  author: "Mhmod Nemr Alijla",
  get copyright() {
    return `© ${new Date().getFullYear()} ${this.author}`;
  },
  officialDomain: "https://ai.mhmodijla.com",
  version: "1.0.0",
  storageSchemaVersion: 1,

  // Default system prompt
  defaultSystemPrompt: "أنت مساعد MijlAi الذكي، خبير برمجيات ومعرفة عامة، أتبع لتطبيق MijlAi. قام بتدريبك وتطويرك ومالك هذه الأداة هو محمود نمر العجلة (Mhmod Nemr Alijla).",

  // Built-in Default Providers & MijlAI Verified Models
  defaultProviders: [
    {
      id: "g4f",
      name: "MijlAI Engine (حقيقي / شغال 100%)",
      baseURL: "/api/chat",
      isBuiltIn: true,
      requiresApiKey: false,
      isFree: true,
      models: [
        // Verified Functional Models
        { id: "g4f:gpt-4o", name: "MijlAI Pro (GPT-4o)", provider: "g4f", icon: "sparkles", is_free: true, category: "OpenAI" },
        { id: "g4f:o3-mini", name: "MijlAI Thinking (o3-mini)", provider: "g4f", icon: "brain", is_free: true, category: "OpenAI" },
        { id: "g4f:gemini", name: "MijlAI Flash (Gemini)", provider: "g4f", icon: "zap", is_free: true, category: "Gemini" },
        { id: "g4f:gpt-4", name: "MijlAI Turbo (GPT-4)", provider: "g4f", icon: "sparkles", is_free: true, category: "OpenAI" }
      ]
    }
  ],

  // Keyboard Shortcuts
  shortcuts: [
    { key: "Ctrl + K / Cmd + K", label: "بحث سريع وتصفح المحادثات" },
    { key: "Ctrl + Shift + O / Cmd + Shift + O", label: "محادثة جديدة" },
    { key: "Escape", label: "إغلاق الشاشات الجانبية والإعدادات" },
    { key: "Shift + Enter", label: "سطر جديد في مربع الإدخال" },
    { key: "Enter", label: "إرسال الرسالة" }
  ]
};
