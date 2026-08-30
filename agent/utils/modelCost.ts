// agent/utils/modelCost.ts
// Grille tarifaire et calcul de cout (doc 12).

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ModelPricing {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

// Prix en $ par million de tokens.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'MijlAI-opus-4-6': { input: 15.0, output: 75.0, cacheCreation: 18.75, cacheRead: 1.5 },
  'MijlAI-sonnet-4-6': { input: 3.0, output: 15.0, cacheCreation: 3.75, cacheRead: 0.3 },
  'MijlAI-haiku-4-5': { input: 0.8, output: 4.0, cacheCreation: 1.0, cacheRead: 0.08 },
  'mijlai-pwr': { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }, // interne : gratuit
};

export function calculateCost(usage: TokenUsage, model: string): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['mijlai-pwr'];
  return (
    ((usage.input_tokens || 0) * pricing.input +
      (usage.output_tokens || 0) * pricing.output +
      (usage.cache_creation_input_tokens || 0) * pricing.cacheCreation +
      (usage.cache_read_input_tokens || 0) * pricing.cacheRead) /
    1_000_000
  );
}
