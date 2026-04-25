import { cpSync, mkdtempSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readBudgetState } from '../src/budget.js';
import { getCostTrend, getSessionCost, getToolUsage, registerTools, suggestOptimizations } from '../src/tools/index.js';

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

afterEach(() => {
  vi.unstubAllEnvs();
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
    expect(result.sessionCount).toBe(2);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools[0].calls).toBeGreaterThan(0);
    expect(result.tools[0].contextSharePercent).toBeGreaterThan(0);
  });
});

describe('get_cost_trend', () => {
  it('rolls fixture sessions into daily trend output', () => {
    const projectPath = makeFixtureWorkspace();
    const result = getCostTrend({ days: 7, projectPath });

    expect(result.projectPath).toBe(projectPath);
    expect(result.days).toBe(7);
    expect(result.totalSessions).toBe(2);
    expect(result.daily.length).toBe(1);
    expect(result.totalCostUsd).toBeGreaterThan(0);
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
    expect(result.budget_alert?.threshold).toBe(50);
    expect(result.hard_capped).toBe(false);
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
    expect(tools[0]).toHaveProperty('name');
    expect(tools[0]).toHaveProperty('roiScore');
    expect(tools[0]).toHaveProperty('estimatedCostShareUsd');
    expect(tools[0]).toHaveProperty('goalProgressScore');
    expect(tools[0]).toHaveProperty('efficiency');

    for (let i = 1; i < tools.length; i += 1) {
      expect(Number(tools[i - 1].roiScore)).toBeLessThanOrEqual(Number(tools[i].roiScore));
    }
  });
});
