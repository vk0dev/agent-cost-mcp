import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { estimateCostUsd } from '../src/pricing.js';
import { detectCostAnomalies, estimateRunCost, getCostForecast } from '../src/tools/index.js';

function makeProjectDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'agent-cost-forecast-'));
}

function writeSession(projectPath: string, name: string, rows: Array<{ timestamp?: string } & Record<string, unknown>>) {
  const filePath = path.join(projectPath, name);
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const stamped = rows
    .map((row) => (typeof row.timestamp === 'string' ? row.timestamp : null))
    .filter((timestamp): timestamp is string => timestamp !== null)
    .sort()
    .at(-1);
  if (stamped) {
    const when = new Date(stamped);
    utimesSync(filePath, when, when);
  }
}

function isoDaysAgo(daysAgo: number, hour = 12) {
  const when = new Date();
  when.setUTCHours(hour, 0, 0, 0);
  when.setUTCDate(when.getUTCDate() - daysAgo);
  return when.toISOString();
}

function dailyAssistantRow(timestamp: string, inputTokens: number, outputTokens: number, model = 'claude-sonnet-4') {
  return {
    type: 'assistant',
    timestamp,
    model,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    message: { content: [] },
  };
}

function forecastError(actual: number, estimate: number) {
  return Math.abs(actual - estimate);
}

describe('forecast and anomaly edge cases', () => {
  it('returns no anomalies for a single-day fixture', () => {
    const projectPath = makeProjectDir();
    writeSession(projectPath, 'single.jsonl', [
      {
        type: 'assistant',
        timestamp: isoDaysAgo(1),
        model: 'claude-sonnet-4',
        usage: {
          input_tokens: 1200,
          output_tokens: 300,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        message: { content: [] },
      },
    ]);

    const result = detectCostAnomalies({ projectPath, days: 7, thresholdPercent: 40, recentTurnWindow: 5 });

    expect(result.projectPath).toBe(projectPath);
    expect(result.baselineDailyCostUsd).toBeGreaterThanOrEqual(0);
    expect(result.anomalies).toEqual([]);
  });

  it('returns low forecast_confidence for one-day sparse history', () => {
    const projectPath = makeProjectDir();
    writeSession(projectPath, 'single-forecast.jsonl', [
      {
        type: 'assistant',
        timestamp: isoDaysAgo(1),
        model: 'claude-sonnet-4',
        usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        message: { content: [] },
      },
    ]);

    const result = getCostForecast({ projectPath, lookbackDays: 30, forecastDays: 30 });

    expect(result.method).toBe('recency-weighted-average-rc2');
    expect(result.confidence).toBe('low');
    expect(result.forecast_confidence.level).toBe('low');
    expect(result.forecast_confidence.reason_codes).toContain('insufficient_non_zero_days');
    expect(result.forecast_confidence.history_days_considered).toBe(1);
    expect(result.forecast_confidence.non_zero_days).toBe(1);
    expect(result.forecast_confidence.projected_range_usd.low).toBeLessThanOrEqual(result.projectedTotalUsd);
    expect(result.forecast_confidence.projected_range_usd.high).toBeGreaterThanOrEqual(result.projectedTotalUsd);
  });

  it('surfaces wide quartile ranges and bursty reason codes for mixed histories', () => {
    const projectPath = makeProjectDir();
    const burstRows = [
      { input_tokens: 1000, output_tokens: 200 },
      { input_tokens: 12000, output_tokens: 6000 },
      { input_tokens: 900, output_tokens: 200 },
      { input_tokens: 18000, output_tokens: 9000 },
    ];
    burstRows.forEach((usage, idx) => {
      writeSession(projectPath, `bursty-day-${idx + 1}.jsonl`, [
        {
          type: 'assistant',
          timestamp: isoDaysAgo(burstRows.length - idx),
          model: 'claude-sonnet-4',
          usage: { ...usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          message: { content: [] },
        },
      ]);
    });

    const result = getCostForecast({ projectPath, lookbackDays: 30, forecastDays: 30 });

    expect(result.method).toBe('recency-weighted-average-rc2');
    expect(result.forecast_confidence.reason_codes).toContain('bursty_spend_pattern');
    expect(result.forecast_confidence.q1_daily_cost_usd).toBeLessThan(result.forecast_confidence.q3_daily_cost_usd);
    expect(result.forecast_confidence.projected_range_usd.low).toBeLessThanOrEqual(result.projectedTotalUsd);
    expect(result.forecast_confidence.projected_range_usd.high).toBeGreaterThanOrEqual(result.projectedTotalUsd);
  });

  it('returns ordered quartiles and high confidence for stable multi-day history', () => {
    const projectPath = makeProjectDir();
    Array.from({ length: 8 }, (_, idx) => idx + 1).forEach((day) => {
      writeSession(projectPath, `stable-day-${day}.jsonl`, [
        dailyAssistantRow(isoDaysAgo(8 - day), 2400, 600),
      ]);
    });

    const result = getCostForecast({ projectPath, lookbackDays: 30, forecastDays: 30 });

    expect(result.method).toBe('recency-weighted-average-rc2');
    expect(result.confidence).toBe('high');
    expect(result.forecast_confidence.level).toBe('high');
    expect(result.forecast_confidence.reason_codes).toContain('stable_spend_history');
    expect(result.forecast_confidence.q1_daily_cost_usd).toBeLessThanOrEqual(result.forecast_confidence.median_daily_cost_usd);
    expect(result.forecast_confidence.median_daily_cost_usd).toBeLessThanOrEqual(result.forecast_confidence.q3_daily_cost_usd);
    expect(result.forecast_confidence.projected_range_usd.low).toBeLessThanOrEqual(result.projectedTotalUsd);
    expect(result.forecast_confidence.projected_range_usd.high).toBeGreaterThanOrEqual(result.projectedTotalUsd);
    expect(result.adjustment_mode).toBe('none');
    expect(result.adjusted_point_estimate_usd).toBeUndefined();
    expect(result.unadjusted_point_estimate_usd).toBeUndefined();
  });

  it('triggers sparse fallback for a one-spike two-day history and gets closer to the next-day truth', () => {
    const projectPath = makeProjectDir();
    writeSession(projectPath, 'day-1.jsonl', [dailyAssistantRow(isoDaysAgo(2), 1000, 200)]);
    writeSession(projectPath, 'day-2.jsonl', [dailyAssistantRow(isoDaysAgo(1), 10000, 2000)]);

    const result = getCostForecast({ projectPath, lookbackDays: 30, forecastDays: 1 });
    const nextDayTruth = estimateCostUsd('claude-sonnet-4', {
      input_tokens: 2500,
      output_tokens: 500,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });

    expect(result.adjustment_mode).toBe('sparse_history_fallback_v1');
    expect(result.adjusted_point_estimate_usd).toBeDefined();
    expect(result.unadjusted_point_estimate_usd).toBeDefined();
    expect(result.projectedTotalUsd).toBe(result.adjusted_point_estimate_usd);
    expect(result.adjusted_point_estimate_usd!).toBeLessThan(result.unadjusted_point_estimate_usd!);
    expect(forecastError(nextDayTruth, result.adjusted_point_estimate_usd!)).toBeLessThan(
      forecastError(nextDayTruth, result.unadjusted_point_estimate_usd!),
    );
  });

  it('triggers sparse fallback for a burst-dominated short history and reduces overshoot', () => {
    const projectPath = makeProjectDir();
    writeSession(projectPath, 'day-a.jsonl', [dailyAssistantRow(isoDaysAgo(2), 2200, 400)]);
    writeSession(projectPath, 'day-b.jsonl', [dailyAssistantRow(isoDaysAgo(1), 18000, 3600)]);

    const result = getCostForecast({ projectPath, lookbackDays: 30, forecastDays: 1 });
    const nextDayTruth = estimateCostUsd('claude-sonnet-4', {
      input_tokens: 3000,
      output_tokens: 600,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });

    expect(result.adjustment_mode).toBe('sparse_history_fallback_v1');
    expect(result.adjusted_point_estimate_usd).toBeDefined();
    expect(result.unadjusted_point_estimate_usd).toBeDefined();
    expect(result.projectedTotalUsd).toBe(result.adjusted_point_estimate_usd);
    expect(result.adjusted_point_estimate_usd!).toBeLessThan(result.unadjusted_point_estimate_usd!);
    expect(forecastError(nextDayTruth, result.adjusted_point_estimate_usd!)).toBeLessThan(
      forecastError(nextDayTruth, result.unadjusted_point_estimate_usd!),
    );
  });

  it('keeps zero-cost days out of anomaly output even when every non-zero day is unusual', () => {
    const projectPath = makeProjectDir();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    writeSession(projectPath, 'mixed.jsonl', [
      {
        type: 'assistant',
        timestamp: new Date(now - 2 * day).toISOString(),
        model: 'claude-sonnet-4',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        message: { content: [] },
      },
      {
        type: 'assistant',
        timestamp: new Date(now - day).toISOString(),
        model: 'claude-opus-4',
        usage: { input_tokens: 24000, output_tokens: 12000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        message: { content: [] },
      },
      {
        type: 'assistant',
        timestamp: new Date(now).toISOString(),
        model: 'claude-haiku-3-5',
        usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        message: { content: [] },
      },
    ]);

    const result = detectCostAnomalies({ projectPath, days: 7, thresholdPercent: 10, recentTurnWindow: 5 });

    expect(result.baselineDailyCostUsd).toBeGreaterThan(0);
    expect(result.anomalies).toEqual([]);
  });

  it('falls back cleanly when model pricing entries are missing or only partially match the model id', () => {
    const missing = estimateRunCost({
      model: 'unknown-model',
      prompt_tokens: 1000,
      expected_output_tokens: 500,
      cached_input_tokens: 0,
      new_input_tokens: 1000,
    });

    const partial = estimateRunCost({
      model: 'claude-sonnet-4',
      prompt_tokens: 1000,
      expected_output_tokens: 500,
      cached_input_tokens: 100,
      new_input_tokens: 900,
    });

    expect(missing.pricingModel).toBeTruthy();
    expect(missing.assumptions.some((entry) => entry.includes('Unknown model'))).toBe(true);
    expect(missing.estimateUsd).toBeGreaterThan(0);
    expect(partial.pricingModel).toBe('claude-sonnet-4');
    expect(partial.assumptions.some((entry) => entry.includes('nearest-model fallback rules'))).toBe(true);
    expect(partial.estimateUsd).toBeGreaterThan(0);
    expect(Number.isFinite(partial.estimateUsd)).toBe(true);
  });
});
