import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { summarizeSessionLogs } from '../parser.js';
import { evaluateBudgetStatus, readBudgetState, writeBudgetState } from '../budget.js';
import { emitMonitorEvent, saveMonitorWebhookConfig } from '../monitorWebhook.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PROJECT_PATH = path.resolve('fixtures');

const sessionRequestSchema = z.object({
  sessionId: z.string().min(1).optional(),
  projectPath: z.string().min(1).optional(),
});

const toolUsageRequestSchema = z.object({
  sessionId: z.string().min(1).optional(),
  days: z.number().int().positive().max(3650).optional(),
  projectPath: z.string().min(1).optional(),
});

const costTrendRequestSchema = z.object({
  days: z.number().int().positive().max(3650).default(7),
  projectPath: z.string().min(1).optional(),
});

const suggestionSchema = z.object({
  action: z.string(),
  reason: z.string(),
  impact: z.enum(['low', 'medium', 'high']),
  savingsHint: z.string(),
});

const configureBudgetRequestSchema = z.object({
  daily_usd: z.number().positive().optional(),
  per_session_usd: z.number().positive().optional(),
  alert_thresholds: z.array(z.number().min(1).max(100)).min(1).optional(),
});

const configureBudgetOutputSchema = z.object({
  ok: z.literal(true),
  budget_state: z.object({
    daily_usd: z.number().positive().optional(),
    per_session_usd: z.number().positive().optional(),
    alert_thresholds: z.array(z.number()),
    updated_at: z.string(),
  }),
});

const monitorWebhookRequestSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(1),
});

const monitorWebhookOutputSchema = z.object({
  ok: z.literal(true),
  url: z.string().url(),
  configured: z.literal(true),
});

const budgetAlertSchema = z.object({
  scope: z.enum(['daily', 'session']),
  threshold: z.number(),
  percentUsed: z.number(),
  limitUsd: z.number(),
  currentUsd: z.number(),
  message: z.string(),
});

const sessionCostOutputSchema = z.object({
  sessionPath: z.string(),
  subagentPaths: z.array(z.string()),
  turnCount: z.number().int().nonnegative(),
  totals: z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
    cache_read_input_tokens: z.number().nonnegative(),
    cache_creation_input_tokens: z.number().nonnegative(),
    tool_use_count: z.number().int().nonnegative(),
    tool_result_count: z.number().int().nonnegative(),
    linked_tool_result_count: z.number().int().nonnegative(),
    estimated_cost_usd: z.number().nonnegative(),
  }),
  budget_alert: budgetAlertSchema.optional(),
  hard_capped: z.boolean(),
  hard_cap_message: z.string().optional(),
});

const toolUsageItemSchema = z.object({
  name: z.string(),
  calls: z.number().int().nonnegative(),
  linkedResults: z.number().int().nonnegative(),
  contextSharePercent: z.number().nonnegative(),
});

const toolUsageOutputSchema = z.object({
  projectPath: z.string(),
  sessionCount: z.number().int().nonnegative(),
  tools: z.array(toolUsageItemSchema),
});

const trendDaySchema = z.object({
  date: z.string(),
  sessions: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
});

const trendOutputSchema = z.object({
  projectPath: z.string(),
  days: z.number().int().positive(),
  totalCostUsd: z.number().nonnegative(),
  totalSessions: z.number().int().nonnegative(),
  daily: z.array(trendDaySchema),
  budget_alert: budgetAlertSchema.optional(),
  hard_capped: z.boolean(),
  hard_cap_message: z.string().optional(),
});

const suggestionsOutputSchema = z.object({
  sessionPath: z.string(),
  suggestions: z.array(suggestionSchema),
});

export type SessionCostResult = z.infer<typeof sessionCostOutputSchema>;
export type ToolUsageResult = z.infer<typeof toolUsageOutputSchema>;
export type CostTrendResult = z.infer<typeof trendOutputSchema>;
export type SuggestionsResult = z.infer<typeof suggestionsOutputSchema>;

function makeToolResponse<T>(data: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function resolveProjectPath(projectPath?: string): string {
  return path.resolve(projectPath ?? DEFAULT_PROJECT_PATH);
}

function collectJsonlFiles(projectPath?: string): string[] {
  const resolved = resolveProjectPath(projectPath);
  if (!existsSync(resolved)) {
    throw new Error(`Project path does not exist: ${resolved}`);
  }

  const walk = (entryPath: string): string[] => {
    const stats = statSync(entryPath);
    if (stats.isFile()) {
      return entryPath.endsWith('.jsonl') ? [entryPath] : [];
    }
    return readdirSync(entryPath, { withFileTypes: true }).flatMap((entry) => walk(path.join(entryPath, entry.name)));
  };

  const files = walk(resolved).sort();
  if (files.length === 0) {
    throw new Error(`No session log files (*.jsonl) found under ${resolved}`);
  }
  return files;
}

function resolveSessionFile(sessionId?: string, projectPath?: string): string {
  const files = collectJsonlFiles(projectPath);
  if (!sessionId) {
    return files[files.length - 1];
  }

  const directPath = path.resolve(sessionId);
  if (existsSync(directPath)) {
    return directPath;
  }

  const normalized = sessionId.replace(/\.jsonl$/i, '');
  const matched = files.find((file) => {
    const base = path.basename(file);
    return base === sessionId || base === `${normalized}.jsonl` || base.includes(normalized);
  });

  if (!matched) {
    throw new Error(`Could not resolve sessionId '${sessionId}' under ${resolveProjectPath(projectPath)}`);
  }

  return matched;
}

function summarizeFiles(files: string[]) {
  return files.map((file) => {
    const summary = summarizeSessionLogs(file);
    return {
      file,
      stats: statSync(file),
      summary,
    };
  });
}

function buildBudgetAwareSessionResult(summary: ReturnType<typeof summarizeSessionLogs>) {
  const budgetStatus = evaluateBudgetStatus({
    budget: readBudgetState(),
    sessionCostUsd: summary.totals.estimated_cost_usd,
    dailyCostUsd: summary.totals.estimated_cost_usd,
  });
  return {
    sessionPath: summary.sessionPath,
    subagentPaths: summary.subagentPaths,
    turnCount: summary.turns.length,
    totals: summary.totals,
    ...budgetStatus,
  };
}

export function getSessionCost(input: z.infer<typeof sessionRequestSchema>): SessionCostResult {
  const sessionPath = resolveSessionFile(input.sessionId, input.projectPath);
  const summary = summarizeSessionLogs(sessionPath);
  return sessionCostOutputSchema.parse(buildBudgetAwareSessionResult(summary));
}

export function getToolUsage(input: z.infer<typeof toolUsageRequestSchema>): ToolUsageResult {
  const files = input.sessionId ? [resolveSessionFile(input.sessionId, input.projectPath)] : collectJsonlFiles(input.projectPath);
  const now = Date.now();
  const filteredFiles = files.filter((file) => {
    if (!input.days) return true;
    return now - statSync(file).mtimeMs <= input.days * DAY_MS;
  });
  if (filteredFiles.length === 0) {
    throw new Error('No session logs matched the requested filters');
  }

  const counts = new Map<string, { calls: number; linkedResults: number }>();
  let totalToolUses = 0;
  for (const { summary } of summarizeFiles(filteredFiles)) {
    for (const turn of summary.turns) {
      totalToolUses += turn.toolUseCount;
      const name = turn.toolUseCount > 0 && turn.assistantId ? turn.assistantId : undefined;
      void name;
    }
  }

  // Re-read line-level tool names from JSONL so tool usage reports can include concrete tool names.
  for (const file of filteredFiles) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, any>;
      const type = String(record.type ?? record.message_type ?? record.role ?? '').toLowerCase();
      if (type.includes('assistant')) {
        const content = record.message?.content ?? record.content ?? [];
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item?.type === 'tool_use') {
              const toolName = String(item.name ?? 'unknown');
              const prev = counts.get(toolName) ?? { calls: 0, linkedResults: 0 };
              prev.calls += 1;
              counts.set(toolName, prev);
            }
          }
        }
      }
      if (type.includes('user')) {
        const content = record.message?.content ?? record.content ?? [];
        if (Array.isArray(content)) {
          const linkedResults = content.filter((item) => item?.type === 'tool_result').length;
          if (linkedResults > 0 && counts.size > 0) {
            const firstTool = [...counts.keys()][0];
            const stats = counts.get(firstTool);
            if (stats) {
              stats.linkedResults += linkedResults;
              counts.set(firstTool, stats);
            }
          }
        }
      }
    }
  }

  const tools = [...counts.entries()]
    .map(([name, stats]) => ({
      name,
      calls: stats.calls,
      linkedResults: stats.linkedResults,
      contextSharePercent: totalToolUses === 0 ? 0 : Number(((stats.calls / totalToolUses) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));

  return toolUsageOutputSchema.parse({
    projectPath: resolveProjectPath(input.projectPath),
    sessionCount: filteredFiles.length,
    tools,
  });
}

export function getCostTrend(input: z.infer<typeof costTrendRequestSchema>): CostTrendResult {
  const files = collectJsonlFiles(input.projectPath);
  const now = Date.now();
  const dailyMap = new Map<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number }>();

  for (const file of files) {
    const stats = statSync(file);
    if (now - stats.mtimeMs > input.days * DAY_MS) {
      continue;
    }
    const date = new Date(stats.mtimeMs).toISOString().slice(0, 10);
    const summary = summarizeSessionLogs(file);
    const prev = dailyMap.get(date) ?? { sessions: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    prev.sessions += 1;
    prev.costUsd = Number((prev.costUsd + summary.totals.estimated_cost_usd).toFixed(6));
    prev.inputTokens += summary.totals.input_tokens;
    prev.outputTokens += summary.totals.output_tokens;
    dailyMap.set(date, prev);
  }

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, ...value }));

  const totalCostUsd = Number(daily.reduce((sum, day) => sum + day.costUsd, 0).toFixed(6));
  const totalSessions = daily.reduce((sum, day) => sum + day.sessions, 0);
  const budgetStatus = evaluateBudgetStatus({
    budget: readBudgetState(),
    sessionCostUsd: totalCostUsd,
    dailyCostUsd: totalCostUsd,
  });

  const result = trendOutputSchema.parse({
    projectPath: resolveProjectPath(input.projectPath),
    days: input.days,
    totalCostUsd,
    totalSessions,
    daily,
    ...budgetStatus,
  });

  if (result.daily.length > 0) {
    const avgDaily = result.totalCostUsd / result.daily.length;
    const projectedMonthlyUsd = Number((avgDaily * 30).toFixed(2));
    void emitMonitorEvent({
      type: 'forecast',
      source: 'get_cost_trend',
      createdAt: new Date().toISOString(),
      payload: {
        projectPath: result.projectPath,
        days: result.days,
        totalCostUsd: result.totalCostUsd,
        projectedMonthlyUsd,
      },
    }).catch(() => undefined);
  }

  return result;
}

export function setMonitorWebhook(input: z.infer<typeof monitorWebhookRequestSchema>) {
  saveMonitorWebhookConfig(input);
  return monitorWebhookOutputSchema.parse({ ok: true, url: input.url, configured: true });
}

export function suggestOptimizations(input: z.infer<typeof sessionRequestSchema>): SuggestionsResult {
  const sessionPath = resolveSessionFile(input.sessionId, input.projectPath);
  const summary = summarizeSessionLogs(sessionPath);
  const suggestions: SuggestionsResult['suggestions'] = [];
  const totalTokens = summary.totals.input_tokens + summary.totals.output_tokens + summary.totals.cache_read_input_tokens + summary.totals.cache_creation_input_tokens;
  const cacheShare = totalTokens === 0 ? 0 : (summary.totals.cache_read_input_tokens / totalTokens) * 100;

  if (cacheShare >= 20) {
    suggestions.push({
      action: 'Trim repeated context blocks before long sessions.',
      reason: `Cache reads account for ${cacheShare.toFixed(1)}% of observed tokens in this session.`,
      impact: cacheShare >= 40 ? 'high' : 'medium',
      savingsHint: 'Review prompts and tool schemas that are repeatedly re-sent but rarely changed.',
    });
  }

  if (summary.totals.tool_use_count > summary.totals.linked_tool_result_count) {
    suggestions.push({
      action: 'Inspect tool calls that do not produce linked results.',
      reason: `${summary.totals.tool_use_count - summary.totals.linked_tool_result_count} tool calls were not linked back to results.`,
      impact: 'medium',
      savingsHint: 'Reducing abandoned tool invocations can cut context churn and output retries.',
    });
  }

  const mostExpensiveTurn = [...summary.turns].sort((a, b) => {
    const aTokens = a.usage.input_tokens + a.usage.output_tokens + a.usage.cache_read_input_tokens + a.usage.cache_creation_input_tokens;
    const bTokens = b.usage.input_tokens + b.usage.output_tokens + b.usage.cache_read_input_tokens + b.usage.cache_creation_input_tokens;
    return bTokens - aTokens;
  })[0];
  if (mostExpensiveTurn) {
    suggestions.push({
      action: 'Use the heaviest turn as a prompt-trimming review target.',
      reason: `Turn ${mostExpensiveTurn.turnIndex} is the densest token consumer in this session.`,
      impact: 'low',
      savingsHint: 'Tightening the highest-cost turn usually gives the clearest first optimization win.',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      action: 'Keep this session as the baseline benchmark.',
      reason: 'No obvious cost anti-patterns were detected in the available log data.',
      impact: 'low',
      savingsHint: 'Compare future sessions against this summary to catch regressions early.',
    });
  }

  return suggestionsOutputSchema.parse({
    sessionPath: summary.sessionPath,
    suggestions,
  });
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    'configure_budget',
    {
      description:
        'When to use: set deterministic daily/session budget caps and alert thresholds for local cost guardrails. Does NOT enforce billing-side spend limits or notify external systems.',
      inputSchema: configureBudgetRequestSchema.shape,
      outputSchema: configureBudgetOutputSchema.shape,
    },
    async (input: unknown) => {
      const parsed = configureBudgetRequestSchema.parse(input);
      if (parsed.daily_usd === undefined && parsed.per_session_usd === undefined) {
        throw new Error('At least one budget limit must be provided');
      }
      return makeToolResponse(configureBudgetOutputSchema.parse({
        ok: true,
        budget_state: writeBudgetState(parsed),
      }));
    },
  );

  server.registerTool(
    'get_session_cost',
    {
      description:
        'When to use: get a single Claude Code session cost summary with token totals and estimated USD cost from a session log. Does NOT fetch remote billing data, reconcile invoices, or infer missing logs.',
      inputSchema: sessionRequestSchema.shape,
      outputSchema: sessionCostOutputSchema.shape,
    },
    async (input) => makeToolResponse(getSessionCost(sessionRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_tool_usage',
    {
      description:
        'When to use: inspect which tools appear most often across one session or a filtered project log directory to spot context-heavy patterns. Does NOT measure per-tool token usage precisely or inspect live Claude Code sessions.',
      inputSchema: toolUsageRequestSchema.shape,
      outputSchema: toolUsageOutputSchema.shape,
    },
    async (input) => makeToolResponse(getToolUsage(toolUsageRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_cost_trend',
    {
      description:
        'When to use: roll session logs into a day-by-day cost trend for a local project path so you can watch spend move over time. Does NOT predict future spend, sync cloud analytics, or backfill missing timestamp history.',
      inputSchema: costTrendRequestSchema.shape,
      outputSchema: trendOutputSchema.shape,
    },
    async (input) => makeToolResponse(getCostTrend(costTrendRequestSchema.parse(input))),
  );

  server.registerTool(
    'set_monitor_webhook',
    {
      description:
        'When to use: configure an alert webhook target for signed monitor events such as forecast/anomaly/cap notifications. Does NOT test the remote endpoint or manage webhook history.',
      inputSchema: monitorWebhookRequestSchema.shape,
      outputSchema: monitorWebhookOutputSchema.shape,
    },
    async (input) => makeToolResponse(setMonitorWebhook(monitorWebhookRequestSchema.parse(input))),
  );

  server.registerTool(
    'suggest_optimizations',
    {
      description:
        'When to use: generate lightweight optimization suggestions from one parsed session log after cost or tool-usage review. Does NOT rewrite prompts automatically, inspect source code, or replace a full human performance audit.',
      inputSchema: sessionRequestSchema.shape,
      outputSchema: suggestionsOutputSchema.shape,
    },
    async (input) => makeToolResponse(suggestOptimizations(sessionRequestSchema.parse(input))),
  );
}
