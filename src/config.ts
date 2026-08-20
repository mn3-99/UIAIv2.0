export const APP_CONFIG = {
  name: "MijlAi",
  tagline: "Local LLM Interface",
  author: "Mhmod Nemr Alijla",
  get copyright() {
    return `© ${new Date().getFullYear()} ${this.author}`;
  },
  officialDomain: "https://ai.mhmodijla.com",
  version: "1.0.0",
  storageSchemaVersion: 1,
  defaultSystemPrompt: "You are a helpful AI assistant.",
  defaultProviders: [
    {
      id: "g4f",
      name: "MijlAI Cloud (Free)",
      baseURL: "/api/chat",
      isBuiltIn: true,
      requiresApiKey: false,
      isFree: true,
      models: [
        { id: "gemini", name: "Gemini (Fast)", provider: "g4f", icon: "zap", is_free: true, category: "Fast" },
        { id: "gpt-4", name: "GPT-4", provider: "g4f", icon: "sparkles", is_free: false, category: "Pro" },
        { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "g4f", icon: "zap", is_free: true, category: "Fast" },
        { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "g4f", icon: "zap", is_free: true, category: "Reasoning" },
        { id: "gemini-auto", name: "Gemini Auto", provider: "g4f", icon: "zap", is_free: true, category: "Auto" },
        { id: "command-a", name: "Command A", provider: "g4f", icon: "sparkles", is_free: true, category: "Creative" },
        { id: "aria", name: "Aria", provider: "g4f", icon: "sparkles", is_free: true, category: "Long Context" }
      ]
    }
  ],
  shortcuts: [
    { key: "Ctrl + K / Cmd + K", label: "Search" },
    { key: "Shift + Enter", label: "New Line" },
    { key: "Enter", label: "Send" }
  ]
};
