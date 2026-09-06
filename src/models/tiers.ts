// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for model tiers.
// Previously there were TWO parallel maps maintained by hand:
//   • MijlaiComposer.verifiedModelsMap (labels/icons/descriptions)
//   • App.tsx modelIdToTier + getModelIdForTier (tier ↔ backend model id)
// Any new model must be added HERE only — UI, routing and arena auto-update.
// ─────────────────────────────────────────────────────────────────────────────
import { Brain, Rocket, Sparkles, Zap, Cpu, Gauge, Image, FlaskConical, Layers } from 'lucide-react';

export interface TierInfo {
  /** tier key used across the UI (e.g. 'flash') */
  id: string;
  /** backend model id sent to /api/chat/send */
  modelId: string;
  label: string;
  shortName: string;
  icon: any; // lucide component
  color: string;
  desc: string;
  realModel: string;
  badge: string;
  /** guests (not signed in) may only use guest-allowed tiers */
  guestAllowed: boolean;
}

const BASE_TIERS: Record<string, TierInfo> = {
  'lalo-fast': {
    id: 'lalo-fast',
    modelId: 'direct:mijlai-lalo-fast',
    label: 'MijlAI-lalo-fast', shortName: 'Lalo', icon: Zap, color: 'text-cyan-600',
    desc: 'نموذج سريع ومجاني — Llama 3.1 8B Turbo عبر LLM7.io',
    realModel: 'L3-8B-Lunaris-v1-Turbo · LLM7', badge: '⚡ مجاني · سريع',
    guestAllowed: true,
  },
  kilo: {
    id: 'kilo',
    modelId: 'direct:kilo',
    label: 'Kilo Free', shortName: 'Kilo', icon: Zap, color: 'text-emerald-600',
    desc: 'نماذج مجانية بلا مفتاح — Step/DeepSeek/LLM عبر Kilo.ai (وكلاء برمجة)',
    realModel: 'kilo-auto/free · Kilo.ai', badge: '⚡ مجاني · بلا مفتاح',
    guestAllowed: true,
  },
  'muse-spark': {
    id: 'muse-spark',
    modelId: 'direct:muse-spark-1.2',
    label: 'Muse Spark', shortName: 'Muse', icon: Sparkles, color: 'text-indigo-600',
    desc: 'Meta Muse Spark — نموذج Llama سريع عبر واجهة Meta AI',
    realModel: 'muse-spark-1.2 · Meta AI', badge: '✨ Meta · Llama',
    guestAllowed: false,
  },
  mini: {
    id: 'mini',
    modelId: 'direct:mijlai-mini',
    label: 'MijlAI-Mini', shortName: 'Mini', icon: Zap, color: 'text-accent',
    desc: 'خفيف وسريع التدفق — للمهام اليومية الفورية (وكيل MijlAI المخصص)',
    realModel: 'MijlAI-Mini · DigitalOcean', badge: '⚡ وكيل مخصص · عبر المحرك',
    guestAllowed: false,
  },
  flash: {
    id: 'flash',
    modelId: 'direct:mijlai-flash',
    label: 'MijlAI-Flash', shortName: 'Flash', icon: Sparkles, color: 'text-amber-500',
    desc: 'أسرع بداية رد يومي بتوازن ممتاز (وكيل MijlAI المخصص)',
    realModel: 'MijlAI-Flash · DigitalOcean', badge: '⏱ وكيل مخصص · عبر المحرك',
    guestAllowed: false,
  },
  pro: {
    id: 'pro',
    modelId: 'direct:mijlai-pro',
    label: 'MijlAI-Pro', shortName: 'Pro', icon: Brain, color: 'text-purple-600',
    desc: 'الأقوى في التحليل والاستدلال والمهام المعقدة (وكيل MijlAI المخصص)',
    realModel: 'MijlAI-Pro · DigitalOcean', badge: '★ وكيل مخصص · عبر المحرك',
    guestAllowed: false,
  },
  pwr: {
    id: 'pwr',
    modelId: 'direct:mijlai-pwr',
    label: 'MijlAI-PWR', shortName: 'PWR', icon: Rocket, color: 'text-rose-600',
    desc: 'وكيل MijlAI المخصص على DigitalOcean — نموذجك الخاص',
    realModel: 'MijlAI-PWR · DigitalOcean', badge: '🛡 وكيل مخصص · حصري',
    guestAllowed: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NVIDIA / Kimi model layer — aggregated from the nvidia-kimi-mcp,
// nvidia-kimi-bridge and kimi-super-agent-hybrid repos. Served through the
// NVIDIA NIM OpenAI-compatible endpoint (build.nvidia.com, free key); the
// frontend sends `direct:nv-*` and the backend maps it to the real NIM slug.
// ─────────────────────────────────────────────────────────────────────────────
export const NVIDIA_TIERS: Record<string, TierInfo> = {
  'nv-kimi-k3': {
    id: 'nv-kimi-k3',
    modelId: 'direct:nv-kimi-k3',
    label: 'Kimi K3', shortName: 'Kimi K3', icon: Sparkles, color: 'text-cyan-600',
    desc: 'Moonshot Kimi K3 على منصة NVIDIA — نموذج التفكير متعدد الوسائط الرئيسي',
    realModel: 'moonshotai/kimi-k3 · NVIDIA NIM', badge: '🧠 تفكير متقدم · NVIDIA',
    guestAllowed: false,
  },
  'nv-nemotron-3-ultra': {
    id: 'nv-nemotron-3-ultra',
    modelId: 'direct:nv-nemotron-3-ultra',
    label: 'Nemotron-3 Ultra', shortName: 'Ultra', icon: Brain, color: 'text-emerald-600',
    desc: 'نموذج NVIDIA العملاق 550B — أقوى استدلال متاح عبر المنصة',
    realModel: 'nvidia/nemotron-3-ultra-550b-a55b', badge: '🧠 استدلال فائق',
    guestAllowed: false,
  },
  'nv-nemotron-3-super': {
    id: 'nv-nemotron-3-super',
    modelId: 'direct:nv-nemotron-3-super',
    label: 'Nemotron-3 Super', shortName: 'Super', icon: Brain, color: 'text-purple-600',
    desc: 'Nemotron-3 Super 120B — توازن ممتاز بين السرعة وجودة الاستدلال',
    realModel: 'nvidia/nemotron-3-super-120b-a12b', badge: '🧠 استدلال قوي',
    guestAllowed: false,
  },
  'nv-nemotron-lightning': {
    id: 'nv-nemotron-lightning',
    modelId: 'direct:nv-nemotron-lightning',
    label: 'Nemotron Lightning', shortName: 'Lightning', icon: Zap, color: 'text-amber-500',
    desc: 'Nemotron-3.5 Lightning 30B — سرعة استجابة عالية للمهام اليومية',
    realModel: 'nvidia/nemotron-3.5-lightning-30b-a3b', badge: '⚡ سريع',
    guestAllowed: false,
  },
  'nv-minimax-m3': {
    id: 'nv-minimax-m3',
    modelId: 'direct:nv-minimax-m3',
    label: 'MiniMax M3', shortName: 'MiniMax', icon: Layers, color: 'text-blue-600',
    desc: 'MiniMax-M3 — نموذج موازنة قوي متعدد اللغات',
    realModel: 'minimaxai/minimax-m3', badge: '🌐 متعدد اللغات',
    guestAllowed: false,
  },
  'nv-gpt-oss-20b': {
    id: 'nv-gpt-oss-20b',
    modelId: 'direct:nv-gpt-oss-20b',
    label: 'GPT-OSS 20B', shortName: 'GPT-OSS', icon: Cpu, color: 'text-slate-600',
    desc: 'OpenAI gpt-oss-20b مفتوح المصدر على منصة NVIDIA',
    realModel: 'openai/gpt-oss-20b', badge: '🔓 مفتوح المصدر',
    guestAllowed: false,
  },
  'nv-muse-glimmer': {
    id: 'nv-muse-glimmer',
    modelId: 'direct:nv-muse-glimmer',
    label: 'Muse Glimmer', shortName: 'Glimmer', icon: Sparkles, color: 'text-indigo-600',
    desc: 'Meta Muse Glimmer 30B — توليد إبداعي سريع',
    realModel: 'meta/muse-glimmer-30b', badge: '✨ إبداعي',
    guestAllowed: false,
  },
  'nv-laguna': {
    id: 'nv-laguna',
    modelId: 'direct:nv-laguna',
    label: 'Laguna', shortName: 'Laguna', icon: FlaskConical, color: 'text-teal-600',
    desc: 'Poolside Laguna — نموذج متخصص في توليد الكود',
    realModel: 'poolside/laguna-xs-2.1', badge: '⌨️ كود',
    guestAllowed: false,
  },
  'nv-diffusiongemma': {
    id: 'nv-diffusiongemma',
    modelId: 'direct:nv-diffusiongemma',
    label: 'DiffusionGemma', shortName: 'DiffGemma', icon: Image, color: 'text-fuchsia-600',
    desc: 'Google DiffusionGemma 26B — نموذج توليدي متقدم',
    realModel: 'google/diffusiongemma-26b-a4b-it', badge: '🎨 توليدي',
    guestAllowed: false,
  },
};

// Merged registry — the single source of truth consumed by the composer,
// arena picker and model routing.
export const TIERS: Record<string, TierInfo> = { ...BASE_TIERS, ...NVIDIA_TIERS };

/** tier id → backend model id. `local:` tiers pass through untouched
 *  (llama.cpp models). Unknown tiers fall back to the pwr endpoint. */
export const tierToModelId = (tier: string): string => {
  if (tier.startsWith('local:')) return tier;
  return TIERS[tier]?.modelId ?? 'direct:mijlai-pwr';
};

/** backend model id → tier id (inverse of tierToModelId) */
const MODEL_ID_TO_TIER: Record<string, string> = Object.fromEntries(
  Object.values(TIERS).map((t) => [t.modelId, t.id])
);
export const modelIdToTier = (modelId: string): string | undefined => MODEL_ID_TO_TIER[modelId];

/** Is this tier usable by a guest (not-signed-in) visitor? */
export const isGuestTier = (tier: string): boolean => TIERS[tier]?.guestAllowed === true;
