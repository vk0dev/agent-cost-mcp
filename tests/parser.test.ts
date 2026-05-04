import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { summarizeSessionLogs } from '../src/parser.js';
import { estimateCostUsd, inferProviderFromModel } from '../src/pricing.js';

const FIXTURES = path.resolve('fixtures');

describe('summarizeSessionLogs', () => {
  it('parses main session turns and links tool results without crashing', () => {
    const summary = summarizeSessionLogs(path.join(FIXTURES, 'session-main.jsonl'));

    expect(summary.turns).toHaveLength(2);
    expect(summary.turns[0]).toMatchObject({
      turnIndex: 1,
      assistantId: 'asst-1',
      model: 'claude-sonnet-4',
      toolUseCount: 1,
      toolResultCount: 1,
      linkedToolResultCount: 1,
    });
    expect(summary.turns[0].usage).toEqual({
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 50,
    });
    expect(summary.totals.input_tokens).toBe(2000);
    expect(summary.totals.output_tokens).toBe(500);
    expect(summary.totals.tool_use_count).toBe(1);
    expect(summary.totals.tool_result_count).toBe(1);
    expect(summary.totals.linked_tool_result_count).toBe(1);
    expect(summary.sessionPath).toContain('session-main.jsonl');
    expect(summary.turns[1].toolUseCount).toBe(0);
    expect(summary.totals.estimated_cost_usd).toBeGreaterThan(0);
  });

  it('includes subagent logs in turn totals and preserves per-turn source files', () => {
    const summary = summarizeSessionLogs(
      path.join(FIXTURES, 'session-main.jsonl'),
      [path.join(FIXTURES, 'session-subagent.jsonl')],
    );

    expect(summary.turns).toHaveLength(3);
    expect(summary.subagentPaths).toHaveLength(1);
    expect(summary.turns[2]).toMatchObject({
      assistantId: 'sub-1',
      model: 'claude-opus-4',
      provider: 'anthropic',
      toolUseCount: 2,
      toolResultCount: 1,
      linkedToolResultCount: 1,
    });
    expect(summary.turns[2].sourceFiles[0]).toContain('session-subagent.jsonl');
    expect(summary.totals.input_tokens).toBe(2400);
    expect(summary.totals.output_tokens).toBe(600);
    expect(summary.totals.cache_read_input_tokens).toBe(125);
    expect(summary.totals.cache_creation_input_tokens).toBe(60);
    expect(summary.totals.tool_use_count).toBe(3);
  });

  it('infers provider metadata for openai, google, and unknown model families without crashing', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-parser-provider-'));
    const sessionPath = path.join(dir, 'session-provider.jsonl');
    writeFileSync(sessionPath, `${[
      { type: 'assistant', uuid: 'openai-1', model: 'gpt-5.5', usage: { input_tokens: 1000, output_tokens: 100 }, message: { content: [] } },
      { type: 'assistant', uuid: 'google-1', model: 'gemini-2.5-pro', usage: { input_tokens: 1000, output_tokens: 100 }, message: { content: [] } },
      { type: 'assistant', uuid: 'unknown-1', model: 'mystery-model-9000', usage: { input_tokens: 1000, output_tokens: 100 }, message: { content: [] } },
    ].map((record) => JSON.stringify(record)).join('\n')}\n`);

    const summary = summarizeSessionLogs(sessionPath);

    expect(summary.turns.map((turn) => ({ model: turn.model, provider: turn.provider }))).toEqual([
      { model: 'gpt-5.5', provider: 'openai' },
      { model: 'gemini-2.5-pro', provider: 'google' },
      { model: 'mystery-model-9000', provider: 'unknown' },
    ]);
  });
});

describe('inferProviderFromModel', () => {
  it('maps bounded provider prefixes deterministically', () => {
    expect(inferProviderFromModel('claude-sonnet-4')).toBe('anthropic');
    expect(inferProviderFromModel('gpt-5.5-pro')).toBe('openai');
    expect(inferProviderFromModel('o3')).toBe('openai');
    expect(inferProviderFromModel('gemini-2.5-pro')).toBe('google');
    expect(inferProviderFromModel('mystery-model-9000')).toBe('unknown');
  });
});

describe('estimateCostUsd', () => {
  it('uses config-driven pricing fields', () => {
    const cost = estimateCostUsd('claude-sonnet-4', {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 250,
      cache_creation_input_tokens: 100,
    });

    expect(cost).toBeGreaterThan(0);
    // input 1000*$3/M + output 500*$15/M + cache_read 250*$0.30/M + cache_create 100*$3.75/M
    // = 0.003 + 0.0075 + 0.000075 + 0.000375 = 0.01095
    expect(cost).toBeCloseTo(0.01095, 6);
  });
});
