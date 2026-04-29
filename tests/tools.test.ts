import { cpSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readBudgetState } from '../src/budget.js';
import { resetTelemetryClient, setTelemetryClient } from '../src/telemetryClient.js';
import { getCostForecast, getCostTrend, getSessionCost, getSubagentTree, getToolUsage, registerTools, suggestOptimizations } from '../src/tools/index.js';

function writeSessionLog(filePath: string, records: Array<Record<string, unknown>>) {
  writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function assistantToolUseRecord(id: string, name: string, input: Record<string, unknown> = {}) {
  return {
    type: 'assistant',
    uuid: id,
    message: {
      content: [{ type: 'tool_use', id: `${id}-tool`, name, input }],
    },
  };
}

function userToolResultRecord(assistantId: string, options: { isError?: boolean; text?: string } = {}) {
  return {
    type: 'user',
    parentUuid: assistantId,
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: `${assistantId}-tool`,
        is_error: options.isError ?? false,
        content: options.text ?? (options.isError ? 'temporary failure' : 'ok'),
      }],
    },
  };
}

const FIXTURES = path.resolve('fixtures');

function makeFixtureWorkspace(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-mcp-'));
  cpSync(FIXTURES, dir, { recursive: true });
  const now = new Date();
  utimesSync(path.join(dir, 'session-main.jsonl'), now, now);
  utimesSync(path.join(dir, 'session-subagent.jsonl'), now, now);
  return dir;
}

function makeFakeServer() {
  return {
    handlers: new Map<string, (input: unknown) => Promise<unknown>>(),
    registerTool(name: string, _meta: unknown, handler: (input: unknown) => Promise<unknown>) {
      this.handlers.set(name, handler);
    },
  };
}

beforeEach(() => {
  resetTelemetryClient();
});

afterEach(() => {
  resetTelemetryClient();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('get_session_cost', () => {
  it('returns structured totals for a resolved session log', () => {
    const projectPath = makeFixtureWorkspace();
    const result = getSessionCost({ sessionId: 'session-main', projectPath });

    expect(result.sessionPath).toContain('session-main.jsonl');
    expect(result.turnCount).toBe(2);
    expect(result.totals.input_tokens).toBe(2000);
    expect(result.totals.tool_use_count).toBe(1);
    expect(result.totals.estimated_cost_usd).toBeGreaterThan(0);
  });
});

describe('get_tool_usage', () => {
  it('aggregates tool calls across fixture logs', () => {
    const projectPath = makeFixtureWorkspace();
    const result = getToolUsage({ projectPath });

    expect(result.projectPath).toBe(projectPath);
    expect(result.sessionCount).toBe(3);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools[0].calls).toBeGreaterThan(0);
    expect(result.tools[0].contextSharePercent).toBeGreaterThan(0);
  });
});

describe('get_subagent_tree', () => {
  it('returns a bounded root-plus-child tree for fixture logs', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = makeFixtureWorkspace();
    const result = getSubagentTree({ sessionId: 'session-main', projectPath });
    expect(result.projectPath).toBe(projectPath);
    expect(result.totalSessions).toBe(3);
    expect(result._meta).toEqual({});
    expect(result.tree.sessionId).toBe('session-main');
    expect(result.tree.children).toHaveLength(2);
    expect(result.tree.children.map((child) => child.sessionId).sort()).toEqual(['demo-anomaly', 'session-subagent']);
    expect(result.totalCostUsd).toBeGreaterThan(0);

    const toolResult = await server.handlers.get('get_subagent_tree')!({ sessionId: 'session-main', projectPath });
    const payload = toolResult.structuredContent as Record<string, unknown>;
    expect(payload._meta).toEqual({});
    expect(payload.totalSessions).toBe(3);
  });

  it('keeps _meta and uses the local telemetry client only when telemetry is opted in', () => {
    vi.stubEnv('AGENT_COST_MCP_TELEMETRY_ENABLED', '1');
    const projectPath = makeFixtureWorkspace();
    const emit = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setTelemetryClient({ emit });

    const result = getSubagentTree({ sessionId: 'session-main', projectPath });

    expect(result._meta).toEqual({});
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'forecast', source: 'get_subagent_tree' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stays cycle-safe when the project tree contains a symlink back to the root session log', () => {
    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-tree-cycle-'));
    const rootPath = path.join(projectPath, 'session-main.jsonl');
    writeSessionLog(rootPath, [
      {
        type: 'assistant',
        uuid: 'root-assistant',
        model: 'gpt-5.5',
        usage: { input_tokens: 1000, output_tokens: 200 },
        message: { content: [] },
      },
    ]);
    symlinkSync(rootPath, path.join(projectPath, 'session-main-alias.jsonl'));

    const result = getSubagentTree({ sessionId: 'session-main', projectPath });

    expect(result.totalSessions).toBe(2);
    expect(result.tree.sessionId).toBe('session-main');
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0]?.sessionId).toBe('session-main-alias');
    expect(result.tree.children[0]?.children).toEqual([]);
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });
});

describe('get_cost_trend', () => {
  it('rolls fixture sessions into daily trend output', () => {
    const projectPath = makeFixtureWorkspace();
    const result = getCostTrend({ days: 7, projectPath });

    expect(result.projectPath).toBe(projectPath);
    expect(result.days).toBe(7);
    expect(result.totalSessions).toBe(3);
    expect(result.daily.length).toBe(1);
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });
});

describe('get_cost_forecast', () => {
  it('projects a bounded local forecast from recent cost trend data', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = makeFixtureWorkspace();
    const result = getCostForecast({ projectPath, lookbackDays: 7, forecastDays: 14 });

    expect(result.projectPath).toBe(projectPath);
    expect(result.lookbackDays).toBe(7);
    expect(result.forecastDays).toBe(14);
    expect(result.baselineDailyCostUsd).toBeGreaterThan(0);
    expect(result.projectedTotalUsd).toBeGreaterThan(0);
    expect(result.projectedMonthlyUsd).toBeGreaterThan(0);
    expect(result.method).toBe('linear-average-rc1');
    expect(result._meta).toEqual({});

    const toolResult = await server.handlers.get('get_cost_forecast')!({ projectPath, lookbackDays: 7, forecastDays: 14 });
    const payload = toolResult.structuredContent as Record<string, unknown>;
    expect(payload._meta).toEqual({});
    expect(payload.method).toBe('linear-average-rc1');
  });

  it('keeps _meta and uses the local telemetry client only when telemetry is opted in', () => {
    vi.stubEnv('AGENT_COST_MCP_TELEMETRY_ENABLED', '1');
    const projectPath = makeFixtureWorkspace();
    const emit = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setTelemetryClient({ emit });

    const result = getCostForecast({ projectPath, lookbackDays: 7, forecastDays: 14 });

    expect(result._meta).toEqual({});
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'forecast', source: 'get_cost_trend' }));
    expect(emit).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'forecast', source: 'get_cost_forecast' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a zero-baseline low-confidence forecast when no recent daily data exists', () => {
    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-forecast-empty-'));
    const result = getCostForecast({ projectPath, lookbackDays: 7, forecastDays: 30 });

    expect(result.baselineDailyCostUsd).toBe(0);
    expect(result.projectedTotalUsd).toBe(0);
    expect(result.projectedMonthlyUsd).toBe(0);
    expect(result.confidence).toBe('low');
    expect(result.assumptions.some((item) => item.includes('zero baseline'))).toBe(true);
  });
});

describe('suggest_optimizations', () => {
  it('returns practical suggestions for a session and handles missing logs', () => {
    const projectPath = makeFixtureWorkspace();
    const result = suggestOptimizations({ sessionId: 'session-main', projectPath });

    expect(result.sessionPath).toContain('session-main.jsonl');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].action.length).toBeGreaterThan(10);
    expect(result.suggestions[0].reason.length).toBeGreaterThan(10);
    expect(() => getSessionCost({ sessionId: 'missing-session', projectPath })).toThrow(/Could not resolve sessionId/);
  });
});

describe('budget controls', () => {
  it('persists deterministic budget state via configure_budget', async () => {
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-budget-home-'));
    vi.stubEnv('HOME', fakeHome);
    const server = makeFakeServer();
    registerTools(server as never);

    const configure = server.handlers.get('configure_budget');
    expect(configure).toBeTruthy();

    await configure!({ daily_usd: 10, per_session_usd: 2, alert_thresholds: [80, 50, 100] });

    expect(readBudgetState()).toMatchObject({
      daily_usd: 10,
      per_session_usd: 2,
      alert_thresholds: [50, 80, 100],
    });
  });

  it('surfaces threshold crossing on cost trend', async () => {
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-budget-home-'));
    vi.stubEnv('HOME', fakeHome);
    const server = makeFakeServer();
    registerTools(server as never);
    await server.handlers.get('configure_budget')!({ daily_usd: 0.05, alert_thresholds: [10, 50, 90] });

    const projectPath = makeFixtureWorkspace();
    const result = getCostTrend({ days: 7, projectPath });

    expect(result.budget_alert).toBeDefined();
    expect(result.budget_alert?.threshold).toBe(90);
    expect(result.hard_capped).toBe(true);
  });

  it('surfaces hard cap on session cost', async () => {
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-budget-home-'));
    vi.stubEnv('HOME', fakeHome);
    const server = makeFakeServer();
    registerTools(server as never);
    await server.handlers.get('configure_budget')!({ per_session_usd: 0.01, alert_thresholds: [50, 100] });

    const projectPath = makeFixtureWorkspace();
    const result = getSessionCost({ sessionId: 'session-main', projectPath });

    expect(result.budget_alert?.threshold).toBe(100);
    expect(result.hard_capped).toBe(true);
    expect(result.hard_cap_message).toMatch(/cap/i);
  });

  it('estimates pre-run cost with cache assumptions and budget check', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const result = await server.handlers.get('estimate_run_cost')!({
      model: 'gpt-5.5',
      prompt_tokens: 10000,
      expected_output_tokens: 2000,
      cached_input_tokens: 4000,
      budget_usd: 0.2,
    });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload.pricingModel).toBe('gpt-5.5');
    expect(payload._meta).toEqual({});
    expect(payload.promptTokens).toBe(10000);
    expect(payload.cachedInputTokens).toBe(4000);
    expect(payload.newInputTokens).toBe(6000);
    expect(Number(payload.estimateUsd)).toBeGreaterThan(0);
    expect(payload.withinBudget).toBe(true);
    expect(payload.assumptions).toContain('new_input_tokens were inferred as prompt_tokens minus cached_input_tokens.');
  });

  it('rejects impossible pre-run token accounting', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    await expect(
      server.handlers.get('estimate_run_cost')!({
        model: 'gpt-5.5-pro',
        prompt_tokens: 1000,
        cached_input_tokens: 800,
        new_input_tokens: 500,
        expected_output_tokens: 200,
      }),
    ).rejects.toThrow(/must equal prompt_tokens/);
  });

  it('falls back to the default pricing entry for an unknown model family and says so explicitly', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const result = await server.handlers.get('estimate_run_cost')!({
      model: 'mystery-model-9000',
      prompt_tokens: 2000,
      expected_output_tokens: 400,
    });
    const payload = result.structuredContent as Record<string, unknown>;
    const assumptions = payload.assumptions as string[];

    expect(payload.pricingModel).toBe('default');
    expect(Number(payload.estimateUsd)).toBeGreaterThan(0);
    expect(assumptions.some((item) => item.includes("Unknown model 'mystery-model-9000' falls back to pricing from 'default'."))).toBe(true);
  });

  it('ranks lower-roi tools first using linked results versus cost share', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = makeFixtureWorkspace();
    const now = new Date();
    utimesSync(path.join(projectPath, 'session-main.jsonl'), now, now);
    utimesSync(path.join(projectPath, 'session-subagent.jsonl'), now, now);

    const result = await server.handlers.get('get_tool_roi')!({ projectPath, days: 7 });
    const payload = result.structuredContent as Record<string, unknown>;
    const tools = payload.tools as Array<Record<string, unknown>>;

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(payload._meta).toEqual({});

    expect(tools[0]).toHaveProperty('name');
    expect(tools[0]).toHaveProperty('roiScore');
    expect(tools[0]).toHaveProperty('estimatedCostShareUsd');
    expect(tools[0]).toHaveProperty('goalProgressScore');
    expect(tools[0]).toHaveProperty('efficiency');

    for (let i = 1; i < tools.length; i += 1) {
      expect(Number(tools[i - 1].roiScore)).toBeLessThanOrEqual(Number(tools[i].roiScore));
    }
  });

  it('flags daily spend anomalies against the recent baseline', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = makeFixtureWorkspace();
    const now = new Date();
    utimesSync(path.join(projectPath, 'session-main.jsonl'), now, now);
    utimesSync(path.join(projectPath, 'session-subagent.jsonl'), now, now);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0 });
    const payload = result.structuredContent as Record<string, unknown>;
    const anomalies = payload.anomalies as Array<Record<string, unknown>>;

    expect(payload._meta).toEqual({});
    expect(payload.runaway_detected).toBe(false);
    expect(Number(payload.baselineDailyCostUsd)).toBeGreaterThan(0);
    expect(Array.isArray(anomalies)).toBe(true);
    if (anomalies.length > 0) {
      expect(anomalies[0]).toHaveProperty('date');
      expect(anomalies[0]).toHaveProperty('deviationUsd');
      expect(anomalies[0]).toHaveProperty('deviationPercent');
      expect(anomalies[0]).toHaveProperty('severity');
      expect(anomalies[0]).toHaveProperty('reason');
    }
  });

  it('returns no anomalies for a single effective day because there is no baseline contrast yet', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-anomaly-single-'));
    const sessionPath = path.join(projectPath, 'session-single.jsonl');
    writeSessionLog(sessionPath, [
      {
        type: 'assistant',
        uuid: 'single-assistant',
        model: 'gpt-5.5',
        usage: { input_tokens: 1000, output_tokens: 500 },
        message: { content: [] },
      },
    ]);
    const now = new Date();
    utimesSync(sessionPath, now, now);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload._meta).toEqual({});
    expect(payload.baselineDailyCostUsd).toBeGreaterThan(0);
    expect(payload.anomalies).toEqual([]);
    expect(payload.runaway_detected).toBe(false);
  });

  it('keeps zero-cost days out of anomaly output even when all observed usage is zero', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-anomaly-zero-'));
    const sessionPath = path.join(projectPath, 'session-zero.jsonl');
    writeSessionLog(sessionPath, [
      {
        type: 'assistant',
        uuid: 'zero-assistant',
        model: 'unknown',
        message: { content: [] },
      },
    ]);
    const now = new Date();
    utimesSync(sessionPath, now, now);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload._meta).toEqual({});
    expect(payload.baselineDailyCostUsd).toBe(0);
    expect(payload.anomalies).toEqual([]);
    expect(payload.runaway_detected).toBe(false);
  });

  it('marks every observed day anomalous when all days diverge sharply from the average baseline', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-anomaly-all-days-'));
    const expensivePath = path.join(projectPath, 'session-expensive.jsonl');
    const quietPath = path.join(projectPath, 'session-quiet.jsonl');
    writeSessionLog(expensivePath, [
      {
        type: 'assistant',
        uuid: 'expensive-assistant',
        model: 'gpt-5.5',
        usage: { input_tokens: 100000, output_tokens: 50000 },
        message: { content: [] },
      },
    ]);
    writeSessionLog(quietPath, [
      {
        type: 'assistant',
        uuid: 'quiet-assistant',
        model: 'unknown',
        message: { content: [] },
      },
    ]);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    utimesSync(expensivePath, now, now);
    utimesSync(quietPath, yesterday, yesterday);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0 });
    const payload = result.structuredContent as Record<string, unknown>;
    const anomalies = payload.anomalies as Array<Record<string, unknown>>;

    expect(payload._meta).toEqual({});
    expect(anomalies).toHaveLength(2);
    expect(anomalies.every((item) => Number(item.deviationPercent) === 100 || Number(item.deviationPercent) === -100)).toBe(true);
  });

  it('detects a repeated identical tool loop with no progress in the recent window', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-loop-'));
    writeSessionLog(
      path.join(projectPath, 'session-loop.jsonl'),
      Array.from({ length: 10 }, (_, index) => assistantToolUseRecord(`loop-${index}`, 'web_search', { query: 'same query' })),
    );

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 10 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload._meta).toEqual({});
    expect(payload.runaway_detected).toBe(true);
    expect(payload.runaway_signature).toBe('web_search');
    expect(payload.runaway_reason_code).toBe('identical_signature_no_progress');
    expect(String(payload.suggested_action)).toContain('web_search');
  });

  it('does not flag repeated searches when queries change and successful results keep arriving', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-productive-search-'));
    const records = Array.from({ length: 10 }, (_, index) => [
      assistantToolUseRecord(`search-${index}`, 'web_search', { query: `topic refinement ${index}` }),
      userToolResultRecord(`search-${index}`, { text: `result batch ${index}` }),
    ]).flat();
    writeSessionLog(path.join(projectPath, 'session-productive-search.jsonl'), records);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 10 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload.runaway_detected).toBe(false);
    expect(payload.runaway_reason_code).toBeUndefined();
  });

  it('does not flag bounded retries that eventually succeed', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-retry-success-'));
    writeSessionLog(path.join(projectPath, 'session-retry-success.jsonl'), [
      assistantToolUseRecord('retry-1', 'web_search', { query: 'status api' }),
      userToolResultRecord('retry-1', { isError: true, text: '429 rate limited' }),
      assistantToolUseRecord('retry-2', 'web_search', { query: 'status api' }),
      userToolResultRecord('retry-2', { isError: true, text: 'timeout' }),
      assistantToolUseRecord('retry-3', 'web_search', { query: 'status api narrow' }),
      userToolResultRecord('retry-3', { text: 'service recovered' }),
      assistantToolUseRecord('retry-4', 'read', { path: 'postmortem.md' }),
      userToolResultRecord('retry-4', { text: 'summary available' }),
    ]);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 4 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload.runaway_detected).toBe(false);
    expect(payload.runaway_reason_code).toBeUndefined();
  });

  it('does not flag productive repeated tool use across fan-out style work', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-fanout-'));
    writeSessionLog(path.join(projectPath, 'session-fanout.jsonl'), [
      assistantToolUseRecord('fanout-1', 'web_search', { query: 'service A docs' }),
      userToolResultRecord('fanout-1', { text: 'service A result' }),
      assistantToolUseRecord('fanout-2', 'web_search', { query: 'service B docs' }),
      userToolResultRecord('fanout-2', { text: 'service B result' }),
      assistantToolUseRecord('fanout-3', 'web_search', { query: 'service C docs' }),
      userToolResultRecord('fanout-3', { text: 'service C result' }),
      assistantToolUseRecord('fanout-4', 'read', { path: 'service-a.md' }),
      userToolResultRecord('fanout-4', { text: 'service A notes' }),
      assistantToolUseRecord('fanout-5', 'read', { path: 'service-b.md' }),
      userToolResultRecord('fanout-5', { text: 'service B notes' }),
      assistantToolUseRecord('fanout-6', 'read', { path: 'service-c.md' }),
      userToolResultRecord('fanout-6', { text: 'service C notes' }),
    ]);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 6 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload.runaway_detected).toBe(false);
    expect(payload.runaway_reason_code).toBeUndefined();
  });

  it('detects an alternating two-tool loop with no progress', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-alt-loop-'));
    writeSessionLog(path.join(projectPath, 'session-alt-loop.jsonl'), [
      assistantToolUseRecord('alt-1', 'web_search', { query: 'same query' }),
      assistantToolUseRecord('alt-2', 'read', { path: 'same-file.md' }),
      assistantToolUseRecord('alt-3', 'web_search', { query: 'same query' }),
      assistantToolUseRecord('alt-4', 'read', { path: 'same-file.md' }),
      assistantToolUseRecord('alt-5', 'web_search', { query: 'same query' }),
      assistantToolUseRecord('alt-6', 'read', { path: 'same-file.md' }),
      assistantToolUseRecord('alt-7', 'web_search', { query: 'same query' }),
      assistantToolUseRecord('alt-8', 'read', { path: 'same-file.md' }),
      assistantToolUseRecord('alt-9', 'web_search', { query: 'same query' }),
      assistantToolUseRecord('alt-10', 'read', { path: 'same-file.md' }),
    ]);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 10 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload.runaway_detected).toBe(true);
    expect(payload.runaway_reason_code).toBe('alternating_cycle_no_progress');
    expect(String(payload.runaway_signature)).toContain('web_search');
    expect(String(payload.runaway_signature)).toContain('read');
  });

  it('detects a retry storm with repeated hard errors and no adaptation', async () => {
    const server = makeFakeServer();
    registerTools(server as never);

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-retry-storm-'));
    const records = Array.from({ length: 10 }, (_, index) => [
      assistantToolUseRecord(`storm-${index}`, 'web_search', { query: 'stuck query' }),
      userToolResultRecord(`storm-${index}`, { isError: true, text: '429 rate limited' }),
    ]).flat();
    writeSessionLog(path.join(projectPath, 'session-retry-storm.jsonl'), records);

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 10 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload.runaway_detected).toBe(true);
    expect(payload.runaway_reason_code).toBe('retry_storm_no_adaptation');
    expect(payload.runaway_signature).toBe('web_search');
  });

  it('keeps _meta and uses the local telemetry client only when telemetry is opted in, including runaway-only output', async () => {
    const server = makeFakeServer();
    registerTools(server as never);
    vi.stubEnv('AGENT_COST_MCP_TELEMETRY_ENABLED', '1');
    const emit = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setTelemetryClient({ emit });

    const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-loop-'));
    writeSessionLog(
      path.join(projectPath, 'session-loop.jsonl'),
      Array.from({ length: 10 }, (_, index) => assistantToolUseRecord(`loop-${index}`, 'web_search', { query: 'same query' })),
    );

    const result = await server.handlers.get('detect_cost_anomalies')!({ projectPath, days: 7, minDailyCostUsd: 0, recentTurnWindow: 10 });
    const payload = result.structuredContent as Record<string, unknown>;

    expect(payload._meta).toEqual({});
    expect(payload.runaway_detected).toBe(true);
    expect(payload.runaway_reason_code).toBe('identical_signature_no_progress');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'forecast', source: 'get_cost_trend' }));
    expect(emit).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'anomaly', source: 'detect_cost_anomalies' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
