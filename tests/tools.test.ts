import { cpSync, mkdtempSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCostTrend, getSessionCost, getToolUsage, suggestOptimizations } from '../src/tools/index.js';

const FIXTURES = path.resolve('fixtures');

function makeFixtureWorkspace(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-mcp-'));
  cpSync(FIXTURES, dir, { recursive: true });
  const now = new Date();
  utimesSync(path.join(dir, 'session-main.jsonl'), now, now);
  utimesSync(path.join(dir, 'session-subagent.jsonl'), now, now);
  return dir;
}

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
