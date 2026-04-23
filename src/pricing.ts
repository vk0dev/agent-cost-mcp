import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pricing } from './types.js';

export type PricingTable = Record<string, Pricing>;
export type WarnFn = (message: string) => void;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRICING_DIR = path.resolve(__dirname, '..', 'pricing');

function assertPricing(value: unknown, source: string): Pricing {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid pricing entry in ${source}`);
  }
  const obj = value as Record<string, unknown>;
  const pricing: Pricing = {
    inputPerMillion: Number(obj.input_per_million ?? 0),
    outputPerMillion: Number(obj.output_per_million ?? 0),
    cacheReadPerMillion: Number(obj.cache_read_per_million ?? 0),
    cacheCreationPerMillion: Number(obj.cache_write_per_million ?? 0),
  };
  for (const [key, val] of Object.entries(pricing)) {
    if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
      throw new Error(`Invalid pricing field ${key} in ${source}`);
    }
  }
  return pricing;
}

export function loadPricingTable(dir = PRICING_DIR): PricingTable {
  const table: PricingTable = {};
  const files = readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
    for (const [model, value] of Object.entries(parsed)) {
      table[model] = assertPricing(value, `${file}:${model}`);
    }
  }
  if (!table.default) {
    throw new Error('pricing config must include a default model entry');
  }
  return table;
}

function parseModelVersion(model: string): { family: string; version?: number } {
  const match = model.match(/^(.*?)-(\d+(?:\.\d+)?)$/);
  if (!match) return { family: model };
  return { family: match[1], version: Number(match[2]) };
}

export function findNearestPricingModel(model: string, table: PricingTable): string {
  if (table[model]) return model;

  const entries = Object.keys(table).filter((key) => key !== 'default');
  const target = parseModelVersion(model);
  const sameFamily = entries.filter((key) => parseModelVersion(key).family === target.family);
  if (sameFamily.length === 0) return 'default';

  const pool = sameFamily;
  let best = pool[0] ?? 'default';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of pool) {
    const parsed = parseModelVersion(candidate);
    let score = 10_000;
    if (target.version !== undefined && parsed.version !== undefined) {
      score = Math.abs(parsed.version - target.version);
    } else if (candidate === model) {
      score = 0;
    } else {
      score = Math.abs(candidate.length - model.length) + (candidate.startsWith(target.family) ? 0 : 1000);
    }

    if (score < bestScore || (score === bestScore && candidate > best)) {
      best = candidate;
      bestScore = score;
    }
  }

  return best || 'default';
}

export const DEFAULT_PRICING_TABLE: PricingTable = loadPricingTable();

export function estimateCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  pricingTable: PricingTable = DEFAULT_PRICING_TABLE,
  warn: WarnFn = console.warn,
): number {
  const direct = pricingTable[model];
  const resolvedModel = direct ? model : findNearestPricingModel(model, pricingTable);
  const pricing = pricingTable[resolvedModel] ?? pricingTable.default;

  if (!direct) {
    warn(`Unknown model '${model}', using pricing from '${resolvedModel}'.`);
  }

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * (pricing.cacheReadPerMillion ?? 0);
  const cacheWriteCost = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * (pricing.cacheCreationPerMillion ?? 0);

  return Number((inputCost + outputCost + cacheReadCost + cacheWriteCost).toFixed(6));
}
