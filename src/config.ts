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
      name: "MijlAI Cloud",
      baseURL: "/api/chat",
      isBuiltIn: true,
      requiresApiKey: false,
      isFree: true,
      models: [
        { id: "direct:mijlai-mini", name: "MijlAI-Mini (DigitalOcean)", provider: "g4f", icon: "zap", is_free: false, category: "Custom" },
        { id: "direct:mijlai-flash", name: "MijlAI-Flash (DigitalOcean)", provider: "g4f", icon: "sparkles", is_free: false, category: "Custom" },
        { id: "direct:mijlai-pro", name: "MijlAI-Pro (DigitalOcean)", provider: "g4f", icon: "brain", is_free: false, category: "Custom" },
        { id: "direct:mijlai-pwr", name: "MijlAI-PWR (DigitalOcean)", provider: "g4f", icon: "sparkles", is_free: true, category: "Custom" }
      ]
    },
    {
      id: "digitalocean",
      name: "MijlAI Engine (مفتاح مخصص)",
      baseURL: "/api/chat",
      isBuiltIn: true,
      requiresApiKey: true,
      isFree: false,
      models: [
        { id: "direct:mijlai-mini", name: "MijlAI-Mini (DigitalOcean)", provider: "digitalocean", icon: "zap", is_free: false, category: "Custom" },
        { id: "direct:mijlai-flash", name: "MijlAI-Flash (DigitalOcean)", provider: "digitalocean", icon: "sparkles", is_free: false, category: "Custom" },
        { id: "direct:mijlai-pro", name: "MijlAI-Pro (DigitalOcean)", provider: "digitalocean", icon: "brain", is_free: false, category: "Custom" },
        { id: "direct:mijlai-pwr", name: "MijlAI-PWR (DigitalOcean)", provider: "digitalocean", icon: "sparkles", is_free: true, category: "Custom" }
      ]
    }
  ],
  shortcuts: [
    { key: "Ctrl + K / Cmd + K", label: "Search" },
    { key: "Shift + Enter", label: "New Line" },
    { key: "Enter", label: "Send" }
  ]
};
