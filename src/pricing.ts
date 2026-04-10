import type { Pricing } from './types.js';

export const DEFAULT_PRICING_TABLE: Record<string, Pricing> = {
  'claude-sonnet-4': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  },
  'claude-opus-4': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheCreationPerMillion: 18.75,
  },
  default: {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  },
};

export function estimateCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  },
  pricingTable: Record<string, Pricing> = DEFAULT_PRICING_TABLE,
): number {
  const pricing = pricingTable[model] ?? pricingTable.default;
  const total =
    (usage.input_tokens / 1_000_000) * pricing.inputPerMillion +
    (usage.output_tokens / 1_000_000) * pricing.outputPerMillion +
    (usage.cache_read_input_tokens / 1_000_000) * (pricing.cacheReadPerMillion ?? 0) +
    (usage.cache_creation_input_tokens / 1_000_000) * (pricing.cacheCreationPerMillion ?? 0);
  return Number(total.toFixed(6));
}
