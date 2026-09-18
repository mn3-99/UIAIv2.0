// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for model tiers.
// Previously there were TWO parallel maps maintained by hand:
//   • MijlaiComposer.verifiedModelsMap (labels/icons/descriptions)
//   • App.tsx modelIdToTier + getModelIdForTier (tier ↔ backend model id)
// Any new model must be added HERE only — UI, routing and arena auto-update.
// ─────────────────────────────────────────────────────────────────────────────
import { Brain, Rocket, Sparkles, Zap, Cpu, Gauge, Image, FlaskConical, Layers, Code } from 'lucide-react';

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
    desc: 'نموذج سريع ومجاني — عبر DS Chat (Session Bridge)',
    realModel: 'deepseek-chat · Session Bridge', badge: '⚡ مجاني · سريع',
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
    desc: 'Meta Muse Spark — نموذج Llama سريع عبر الجسر المحلي (keyless)',
    realModel: 'meta/muse-glimmer-30b · NVIDIA Bridge', badge: '✨ Meta · Llama',
    guestAllowed: false,
  },
  mini: {
    id: 'mini',
    modelId: 'direct:mijlai-mini',
    label: 'MijlAI-Mini', shortName: 'Mini', icon: Zap, color: 'text-accent',
    desc: 'خفيف وسريع التدفق — للمهام اليومية الفورية (وكيل MijlAI المخصص)',
    realModel: 'MijlAI-Mini · Kilo Bridge', badge: '⚡ وكيل مخصص · keyless',
    guestAllowed: false,
  },
  flash: {
    id: 'flash',
    modelId: 'direct:mijlai-flash',
    label: 'MijlAI-Flash', shortName: 'Flash', icon: Sparkles, color: 'text-amber-500',
    desc: 'أسرع بداية رد يومي بتوازن ممتاز (وكيل MijlAI المخصص)',
    realModel: 'MijlAI-Flash · Kilo Bridge', badge: '⏱ وكيل مخصص · keyless',
    guestAllowed: false,
  },
  pro: {
    id: 'pro',
    modelId: 'direct:mijlai-pro',
    label: 'MijlAI-Pro', shortName: 'Pro', icon: Brain, color: 'text-purple-600',
    desc: 'الأقوى في التحليل والاستدلال والمهام المعقدة (وكيل MijlAI المخصص)',
    realModel: 'MijlAI-Pro · Kilo Bridge', badge: '★ وكيل مخصص · keyless',
    guestAllowed: false,
  },
  pwr: {
    id: 'pwr',
    modelId: 'direct:mijlai-pwr',
    label: 'MijlAI-PWR', shortName: 'PWR', icon: Rocket, color: 'text-rose-600',
    desc: 'وكيل MijlAI المخصص على DigitalOcean — نموذجك الخاص',
    realModel: 'MijlAI-PWR · Kilo Bridge', badge: '🛡 وكيل مخصص · حصري',
    guestAllowed: false,
  },
  apitoken: {
    id: 'apitoken',
    modelId: 'direct:apitoken',
    label: 'LFM 2.5 8B', shortName: 'LFM', icon: Brain, color: 'text-teal-600',
    desc: 'Liquid LFM 2.5 8B — نموذج سريع عبر الجسر المحلي (keyless)',
    realModel: 'lfm2.5-8b:latest · apitoken', badge: '🔓 مفتوح · keyless',
    guestAllowed: false,
  },
  pollinations: {
    id: 'pollinations',
    modelId: 'direct:pollinations',
    label: 'Pollinations', shortName: 'Pollinations', icon: Sparkles, color: 'text-orange-600',
    desc: 'Pollinations GPT — نموذج keyless عبر Text.pollinations.ai',
    realModel: 'openai-fast · Pollinations', badge: '⚡ مجاني · keyless',
    guestAllowed: true,
  },
  ovhcloud: {
    id: 'ovhcloud',
    modelId: 'direct:ovhcloud',
    label: 'OVHcloud', shortName: 'OVH', icon: Brain, color: 'text-blue-600',
    desc: 'Qwen3-Coder 30B — نموذج برمجة قوي عبر OVHcloud (keyless)',
    realModel: 'Qwen3-Coder-30B · OVHcloud', badge: '💻 برمجة · keyless',
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
    label: 'Nemotron Lightning', shortName: 'Lightning', icon: Zap, color: 'text-yellow-600',
    desc: 'Nemotron 3.5 Lightning 30B — فائق السرعة، محسّن للاستدلال السريع',
    realModel: 'nvidia/nemotron-3.5-lightning-30b-a3b', badge: '⚡ فائق السرعة',
    guestAllowed: false,
  },
  'nv-muse-glimmer': {
    id: 'nv-muse-glimmer',
    modelId: 'direct:nv-muse-glimmer',
    label: 'Muse Glimmer 30B', shortName: 'Glimmer', icon: Sparkles, color: 'text-pink-600',
    desc: 'Meta Muse Glimmer 30B — نموذج Llama محسّن مع تدفق تفكير (reasoning)',
    realModel: 'meta/muse-glimmer-30b', badge: '✨ تفكير متسلسل',
    guestAllowed: false,
  },
  'nv-gpt-oss': {
    id: 'nv-gpt-oss',
    modelId: 'direct:nv-gpt-oss-20b',
    label: 'GPT-OSS 20B', shortName: 'GPT-OSS', icon: Brain, color: 'text-blue-600',
    desc: 'OpenAI GPT-OSS 20B — نموذج مفتوح المصدر عبر NVIDIA NIM',
    realModel: 'openai/gpt-oss-20b', badge: '🔓 مفتوح المصدر',
    guestAllowed: false,
  },
  'nv-laguna': {
    id: 'nv-laguna',
    modelId: 'direct:nv-laguna',
    label: 'Poolside Laguna', shortName: 'Laguna', icon: Code, color: 'text-teal-600',
    desc: 'Poolside Laguna XS 2.1 — نموذج برمجة سريع ومتخصص',
    realModel: 'poolside/laguna-xs-2.1', badge: '💻 برمجة',
    guestAllowed: false,
  },
  'nv-minimax-m3': {
    id: 'nv-minimax-m3',
    modelId: 'direct:nv-minimax-m3',
    label: 'MiniMax M3', shortName: 'MiniMax', icon: Rocket, color: 'text-orange-600',
    desc: 'MiniMax M3 — نموذج صيني قوي متعدد اللغات',
    realModel: 'minimaxai/minimax-m3', badge: '🌐 متعدد اللغات',
    guestAllowed: false,
  },
  'nv-kimi-k3': {
    id: 'nv-kimi-k3',
    modelId: 'direct:nv-kimi-k3',
    label: 'Kimi K3 (Moonshot)', shortName: 'Kimi K3', icon: Sparkles, color: 'text-rose-600',
    desc: 'Moonshot Kimi K3 — نموذج تفكير متقدم مع reasoning_content أصلي',
    realModel: 'moonshotai/kimi-k3', badge: '🧠 تفكير أصلي',
    guestAllowed: false,
  },
  'nv-llama-vision': {
    id: 'nv-llama-vision',
    modelId: 'direct:nv-llama-vision',
    label: 'Llama 3.2 Vision 11B', shortName: 'Llama Vision', icon: Image, color: 'text-indigo-600',
    desc: 'Meta Llama 3.2 11B Vision — فهم الصور وتحليلها',
    realModel: 'meta/llama-3.2-11b-vision-instruct', badge: '👁️ رؤية',
    guestAllowed: false,
  },
  'nv-diffusiongemma': {
    id: 'nv-diffusiongemma',
    modelId: 'direct:nv-diffusiongemma',
    label: 'DiffusionGemma 26B', shortName: 'DiffusionGemma', icon: FlaskConical, color: 'text-amber-600',
    desc: 'Google DiffusionGemma 26B — نموذج نشر متقدم',
    realModel: 'google/diffusiongemma-26b-a4b-it', badge: '🔬 تجريبي',
    guestAllowed: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Session-bridge layer — web-session models (no official keys) served through
// the local OpenAI-compatible gateway on 127.0.0.1:8791 (deepseek-unified-
// gateway: DeepSeek web + Qwen web + duck.ai UI bridges). Sorted fastest→
// slowest by measured wall time. UI sends `direct:sb-*`, backend maps it to
// the gateway model id via g4f_provider DIRECT_ENDPOINTS (session-bridge).
// ─────────────────────────────────────────────────────────────────────────────
export const SESSION_TIERS: Record<string, TierInfo> = {
  'sb-deepseek-chat': {
    id: 'sb-deepseek-chat',
    modelId: 'direct:sb-deepseek-chat',
    label: 'DeepSeek Chat', shortName: 'DS Chat', icon: Zap, color: 'text-sky-600',
    desc: 'DeepSeek web — أسرع رد مباشر عبر الجلسة',
    realModel: 'deepseek-chat · session bridge', badge: '⚡ الأسرع',
    guestAllowed: false,
  },
  'sb-deepseek-reasoner': {
    id: 'sb-deepseek-reasoner',
    modelId: 'direct:sb-deepseek-reasoner',
    label: 'DeepSeek Reasoner', shortName: 'DS R1', icon: Brain, color: 'text-indigo-600',
    desc: 'DeepSeek R1 — تفكير عميق مع reasoning_content',
    realModel: 'deepseek-reasoner · session bridge', badge: '🧠 تفكير + سرعة',
    guestAllowed: false,
  },
  'sb-duck-oss': {
    id: 'sb-duck-oss',
    modelId: 'direct:sb-duck-oss',
    label: 'GPT-OSS 120B (Duck)', shortName: 'OSS', icon: Cpu, color: 'text-slate-600',
    desc: 'gpt-oss 120B عبر duck.ai — مفتوح المصدر',
    realModel: 'duck-oss · session bridge', badge: '🆓 مفتوح',
    guestAllowed: false,
  },
  'sb-duck-mistral': {
    id: 'sb-duck-mistral',
    modelId: 'direct:sb-duck-mistral',
    label: 'Mistral Small 4 (Duck)', shortName: 'Mistral', icon: Layers, color: 'text-orange-600',
    desc: 'Mistral Small 4 عبر duck.ai',
    realModel: 'duck-mistral · session bridge', badge: '🆓 مفتوح',
    guestAllowed: false,
  },
  'sb-duck-gpt-mini': {
    id: 'sb-duck-gpt-mini',
    modelId: 'direct:sb-duck-gpt-mini',
    label: 'GPT-5.4 mini (Duck)', shortName: 'Mini', icon: Zap, color: 'text-teal-600',
    desc: 'GPT-5.4 mini عبر duck.ai',
    realModel: 'duck-gpt-mini · session bridge', badge: '⚡ سريع',
    guestAllowed: false,
  },
  'sb-duck-gemma': {
    id: 'sb-duck-gemma',
    modelId: 'direct:sb-duck-gemma',
    label: 'Gemma 4 31B (Duck)', shortName: 'Gemma', icon: Sparkles, color: 'text-blue-600',
    desc: 'Gemma 4 31B عبر duck.ai',
    realModel: 'duck-gemma · session bridge', badge: '🆓 مفتوح',
    guestAllowed: false,
  },
  'sb-duck-haiku': {
    id: 'sb-duck-haiku',
    modelId: 'direct:sb-duck-haiku',
    label: 'Claude Haiku 4.5 (Duck)', shortName: 'Haiku', icon: FlaskConical, color: 'text-amber-600',
    desc: 'Claude Haiku 4.5 عبر duck.ai — الأذكى في duck',
    realModel: 'duck-haiku · session bridge', badge: '🧠 ذكي',
    guestAllowed: false,
  },
  'sb-duck-luna': {
    id: 'sb-duck-luna',
    modelId: 'direct:sb-duck-luna',
    label: 'GPT-5.6 Luna (Duck)', shortName: 'Luna', icon: Rocket, color: 'text-violet-600',
    desc: 'GPT-5.6 Luna عبر duck.ai — الأفضل للاستخدام اليومي',
    realModel: 'duck-luna · session bridge', badge: '🌙 يومي',
    guestAllowed: false,
  },
  'sb-qwen': {
    id: 'sb-qwen',
    modelId: 'direct:sb-qwen',
    label: 'Qwen3.7-Plus', shortName: 'Qwen', icon: Code, color: 'text-purple-600',
    desc: 'Qwen3.7-Plus عبر جلسة الويب — قوي لكنه الأبطأ',
    realModel: 'qwen3.7-plus · session bridge', badge: ' قوي',
    guestAllowed: false,
  },
  'sb-kimi-k3': {
    id: 'sb-kimi-k3',
    modelId: 'direct:sb-kimi-k3',
    label: 'Kimi K3 Web', shortName: 'Kimi K3', icon: Sparkles, color: 'text-rose-600',
    desc: 'Kimi K3 عبر جلسة www.kimi.ai — تفكير متقدم ومراحل استدلال',
    realModel: 'kimi-k3 · kimi-web bridge', badge: '🧠 تفكير عميق',
    guestAllowed: false,
  },
  'sb-kimi-k2.6': {
    id: 'sb-kimi-k2.6',
    modelId: 'direct:sb-kimi-k2.6',
    label: 'Kimi K2.6 Web', shortName: 'Kimi K2', icon: Sparkles, color: 'text-pink-600',
    desc: 'Kimi K2.6 عبر جلسة www.kimi.ai',
    realModel: 'kimi-k2.6 · kimi-web bridge', badge: '⚡ سريع',
    guestAllowed: false,
  },
  'sb-kimi-code': {
    id: 'sb-kimi-code',
    modelId: 'direct:sb-kimi-code',
    label: 'Kimi Coder Web', shortName: 'Kimi Code', icon: Code, color: 'text-fuchsia-600',
    desc: 'Kimi K2.7 Code عبر جلسة www.kimi.ai — متخصص بالبرمجة',
    realModel: 'kimi-k2.7-code · kimi-web bridge', badge: '💻 برمجة',
    guestAllowed: false,
  },
};

// Merged registry — the single source of truth consumed by the composer,
// arena picker and model routing.
export const TIERS: Record<string, TierInfo> = { ...BASE_TIERS, ...NVIDIA_TIERS, ...SESSION_TIERS };

/** tier id → backend model id. `local:` tiers pass through untouched
 *  (llama.cpp models). `custom:` tiers (user-added providers) pass through
 *  untouched — the backend resolves them via custom_base_url/custom_model.
 *  Unknown tiers fall back to the pwr endpoint. */
export const tierToModelId = (tier: string): string => {
  if (tier.startsWith('local:')) return tier;
  if (tier.startsWith('custom:')) return tier;
  return TIERS[tier]?.modelId ?? 'direct:mijlai-pwr';
};

/** Dynamic tiers from user-added custom providers (persisted in settings).
 *  Tier id == backend model id (`custom:<providerId>:<model>`). */
export function getCustomTiers(): Record<string, TierInfo> {
  try {
    const raw = localStorage.getItem('mijlai_v1_settings');
    if (!raw) return {};
    const provs = JSON.parse(raw)?.customProviders;
    if (!Array.isArray(provs)) return {};
    const out: Record<string, TierInfo> = {};
    for (const p of provs) {
      if (!p || p.isBuiltIn || !p.baseURL || !Array.isArray(p.models)) continue;
      for (const m of p.models) {
        const mid = String(m?.id || '');
        if (!mid.startsWith('custom:')) continue;
        out[mid] = {
          id: mid, modelId: mid,
          label: String(m?.name || mid), shortName: String(p.name || 'Custom').slice(0, 12),
          icon: Layers, color: 'text-teal-500',
          desc: `مزود مخصص: ${p.name} — عبر الجسر الخلفي (بلا CORS)`,
          realModel: `${mid} · ${p.name}`, badge: '🔌 مزود مخصص',
          guestAllowed: false,
        };
      }
    }
    return out;
  } catch { return {}; }
}

/** backend model id → tier id (inverse of tierToModelId) */
const MODEL_ID_TO_TIER: Record<string, string> = Object.fromEntries(
  Object.values(TIERS).map((t) => [t.modelId, t.id])
);
export const modelIdToTier = (modelId: string): string | undefined => MODEL_ID_TO_TIER[modelId];

/** Is this tier usable by a guest (not-signed-in) visitor? */
export const isGuestTier = (tier: string): boolean => TIERS[tier]?.guestAllowed === true;
