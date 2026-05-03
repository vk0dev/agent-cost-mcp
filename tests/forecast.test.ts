import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectCostAnomalies, estimateRunCost } from '../src/tools/index.js';

function makeProjectDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'agent-cost-forecast-'));
}

function writeSession(projectPath: string, name: string, rows: unknown[]) {
  writeFileSync(path.join(projectPath, name), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

describe('forecast and anomaly edge cases', () => {
  it('returns no anomalies for a single-day fixture', () => {
    const projectPath = makeProjectDir();
    writeSession(projectPath, 'single.jsonl', [
      {
        type: 'assistant',
        timestamp: '2026-05-01T12:00:00.000Z',
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

  it('keeps zero-cost days out of anomaly output even when every non-zero day is unusual', () => {
    const projectPath = makeProjectDir();
    writeSession(projectPath, 'mixed.jsonl', [
      {
        type: 'assistant',
        timestamp: '2026-05-01T12:00:00.000Z',
        model: 'claude-sonnet-4',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        message: { content: [] },
      },
      {
        type: 'assistant',
        timestamp: '2026-05-02T12:00:00.000Z',
        model: 'claude-opus-4',
        usage: { input_tokens: 24000, output_tokens: 12000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        message: { content: [] },
      },
      {
        type: 'assistant',
        timestamp: '2026-05-03T12:00:00.000Z',
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
