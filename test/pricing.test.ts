import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PRICING_TABLE,
  estimateCostUsd,
  findNearestPricingModel,
  loadPricingTable,
} from '../src/pricing.js';

const usage = {
  input_tokens: 1_000_000,
  output_tokens: 1_000_000,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

describe('pricing config', () => {
  it('loads required models from pricing json files', () => {
    const table = loadPricingTable();
    expect(table['claude-sonnet-4']).toBeTruthy();
    expect(table['claude-sonnet-4.5']).toBeTruthy();
    expect(table['claude-sonnet-4.6']).toBeTruthy();
    expect(table['claude-opus-4']).toBeTruthy();
    expect(table['claude-opus-4.5']).toBeTruthy();
    expect(table['claude-opus-4.7']).toBeTruthy();
    expect(table['claude-haiku-4.5']).toBeTruthy();
    expect(table['gpt-5.2']).toBeTruthy();
    expect(table['gpt-5.4']).toBeTruthy();
  });

  it('matches boot default table to loaded pricing config', () => {
    expect(DEFAULT_PRICING_TABLE).toEqual(loadPricingTable());
  });

  it('finds nearest model in same family for unknown variants', () => {
    const nearest = findNearestPricingModel('claude-sonnet-4.4', DEFAULT_PRICING_TABLE);
    expect(nearest).toBe('claude-sonnet-4.5');
  });

  it('falls back to nearest known model and logs a warning', () => {
    const warn = vi.fn();
    const exact = estimateCostUsd('claude-sonnet-4.5', usage, DEFAULT_PRICING_TABLE);
    const unknown = estimateCostUsd('claude-sonnet-4.4', usage, DEFAULT_PRICING_TABLE, warn);

    expect(unknown).toBe(exact);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('claude-sonnet-4.4');
  });

  it('keeps config-driven cache read and cache creation pricing intact', () => {
    const cost = estimateCostUsd(
      'claude-sonnet-4.5',
      {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
      },
      DEFAULT_PRICING_TABLE,
    );

    expect(cost).toBe(22.05);
  });

  it('falls back to default pricing when no family match exists', () => {
    const warn = vi.fn();
    const unknown = estimateCostUsd('mystery-model-99', usage, DEFAULT_PRICING_TABLE, warn);
    const fallback = estimateCostUsd('default', usage, DEFAULT_PRICING_TABLE);

    expect(unknown).toBe(fallback);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
