import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { summarizeSessionLogs } from '../parser.js';
import { evaluateBudgetStatus, readBudgetState, writeBudgetState } from '../budget.js';
import { saveMonitorWebhookConfig } from '../monitorWebhook.js';
import { getTelemetryClient } from '../telemetryClient.js';
import { DEFAULT_PRICING_TABLE, estimateCostUsd, findNearestPricingModel, inferProviderFromModel } from '../pricing.js';

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

const subagentTreeRequestSchema = z.object({
  sessionId: z.string().min(1).optional(),
  projectPath: z.string().min(1).optional(),
});

const costTrendRequestSchema = z.object({
  days: z.number().int().positive().max(3650).default(7),
  projectPath: z.string().min(1).optional(),
});

const costForecastRequestSchema = z.object({
  projectPath: z.string().min(1).optional(),
  lookbackDays: z.number().int().positive().max(3650).default(7),
  forecastDays: z.number().int().positive().max(365).default(30),
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
  mode: z.enum(['warn', 'block']).optional(),
});

const configureBudgetOutputSchema = z.object({
  ok: z.literal(true),
  budget_state: z.object({
    daily_usd: z.number().positive().optional(),
    per_session_usd: z.number().positive().optional(),
    alert_thresholds: z.array(z.number()),
    mode: z.enum(['warn', 'block']),
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
  providers: z.array(z.enum(['anthropic', 'openai', 'google', 'unknown'])),
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
  budget_blocked: z.boolean(),
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

const toolRoiItemSchema = z.object({
  name: z.string(),
  calls: z.number().int().nonnegative(),
  linkedResults: z.number().int().nonnegative(),
  contextSharePercent: z.number().nonnegative(),
  estimatedCostShareUsd: z.number().nonnegative(),
  goalProgressScore: z.number().nonnegative(),
  roiScore: z.number(),
  efficiency: z.enum(['high', 'medium', 'low']),
});

const toolRoiOutputSchema = z.object({
  projectPath: z.string(),
  sessionCount: z.number().int().nonnegative(),
  tools: z.array(toolRoiItemSchema),
  _meta: z.record(z.string(), z.unknown()).optional(),
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
  budget_blocked: z.boolean(),
});

const forecastConfidenceSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  reason_codes: z.array(z.enum([
    'insufficient_non_zero_days',
    'short_history_window',
    'bursty_spend_pattern',
    'stable_spend_history',
  ])),
  history_days_considered: z.number().int().nonnegative(),
  non_zero_days: z.number().int().nonnegative(),
  q1_daily_cost_usd: z.number().nonnegative(),
  median_daily_cost_usd: z.number().nonnegative(),
  q3_daily_cost_usd: z.number().nonnegative(),
  projected_range_usd: z.object({
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
  }),
});

const costForecastOutputSchema = z.object({
  projectPath: z.string(),
  lookbackDays: z.number().int().positive(),
  forecastDays: z.number().int().positive(),
  baselineDailyCostUsd: z.number().nonnegative(),
  projectedTotalUsd: z.number().nonnegative(),
  projectedMonthlyUsd: z.number().nonnegative(),
  method: z.enum(['recency-weighted-average-rc2']),
  confidence: z.enum(['low', 'medium', 'high']),
  adjustment_mode: z.enum(['none', 'sparse_history_fallback_v1']),
  adjusted_point_estimate_usd: z.number().nonnegative().optional(),
  unadjusted_point_estimate_usd: z.number().nonnegative().optional(),
  forecast_confidence: forecastConfidenceSchema,
  assumptions: z.array(z.string()),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

const subagentTreeNodeSchema: z.ZodType<{
  sessionPath: string;
  sessionId: string;
  estimatedCostUsd: number;
  subtreeCost: number;
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  children: Array<any>;
}> = z.lazy(() =>
  z.object({
    sessionPath: z.string(),
    sessionId: z.string(),
    estimatedCostUsd: z.number().nonnegative(),
    subtreeCost: z.number().nonnegative(),
    turnCount: z.number().int().nonnegative(),
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    children: z.array(subagentTreeNodeSchema),
  }),
);

const subagentTreeOutputSchema = z.object({
  projectPath: z.string(),
  rootSessionPath: z.string(),
  totalSessions: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  tree: subagentTreeNodeSchema,
  _meta: z.record(z.string(), z.unknown()).optional(),
});

const anomalyRequestSchema = z.object({
  projectPath: z.string().min(1).optional(),
  days: z.number().int().positive().max(3650).default(14),
  minDailyCostUsd: z.number().nonnegative().default(0.01),
  recentTurnWindow: z.number().int().positive().max(50).default(10),
});

const anomalyItemSchema = z.object({
  date: z.string(),
  costUsd: z.number().nonnegative(),
  sessions: z.number().int().nonnegative(),
  deviationUsd: z.number(),
  deviationPercent: z.number(),
  severity: z.enum(['medium', 'high']),
  reason: z.string(),
});

const anomalyOutputSchema = z.object({
  projectPath: z.string(),
  days: z.number().int().positive(),
  baselineDailyCostUsd: z.number().nonnegative(),
  anomalies: z.array(anomalyItemSchema),
  runaway_detected: z.boolean(),
  runaway_signature: z.string().optional(),
  runaway_reason_code: z.enum(['identical_signature_no_progress', 'alternating_cycle_no_progress', 'retry_storm_no_adaptation']).optional(),
  suggested_action: z.string().optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

const suggestionsOutputSchema = z.object({
  sessionPath: z.string(),
  suggestions: z.array(suggestionSchema),
});

const estimateRunRequestSchema = z.object({
  model: z.string().min(1),
  prompt_tokens: z.number().int().nonnegative(),
  expected_output_tokens: z.number().int().nonnegative(),
  cached_input_tokens: z.number().int().nonnegative().optional(),
  new_input_tokens: z.number().int().nonnegative().optional(),
  budget_usd: z.number().nonnegative().optional(),
});

const estimateRunOutputSchema = z.object({
  model: z.string(),
  provider: z.enum(['anthropic', 'openai', 'google', 'unknown']),
  pricingModel: z.string(),
  estimateUsd: z.number().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  expectedOutputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  newInputTokens: z.number().int().nonnegative(),
  withinBudget: z.boolean().optional(),
  budgetUsd: z.number().nonnegative().optional(),
  assumptions: z.array(z.string()),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export type SessionCostResult = z.infer<typeof sessionCostOutputSchema>;
export type ToolUsageResult = z.infer<typeof toolUsageOutputSchema>;
export type ToolRoiResult = z.infer<typeof toolRoiOutputSchema>;
export type CostTrendResult = z.infer<typeof trendOutputSchema>;
export type AnomalyResult = z.infer<typeof anomalyOutputSchema>;
export type SuggestionsResult = z.infer<typeof suggestionsOutputSchema>;
export type EstimateRunResult = z.infer<typeof estimateRunOutputSchema>;
export type SubagentTreeResult = z.infer<typeof subagentTreeOutputSchema>;
export type CostForecastResult = z.infer<typeof costForecastOutputSchema>;

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
  const exactMatch = files.find((file) => {
    const base = path.basename(file);
    return base === sessionId || base === `${normalized}.jsonl`;
  });
  const fuzzyMatch = files.find((file) => path.basename(file).includes(normalized));
  const matched = exactMatch ?? fuzzyMatch;

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
    providers: [...new Set(summary.turns.map((turn) => turn.provider))].sort(),
    totals: summary.totals,
    ...budgetStatus,
  };
}

function readJsonlRows(sessionPath: string): Array<Record<string, unknown>> {
  return readFileSync(sessionPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function hasBoundedRecoveryAfterTransientFailure(
  turns: Array<{ toolNameSignature: string; successCount: number; errorCount: number }>,
  maxErrorStreak = 3,
  maxTurnsUntilRecovery = 2,
): boolean {
  for (let start = 0; start < turns.length; start += 1) {
    const firstTurn = turns[start];
    if (!firstTurn || firstTurn.errorCount === 0 || firstTurn.successCount > 0) {
      continue;
    }

    let streakLength = 0;
    while (
      start + streakLength < turns.length
      && turns[start + streakLength]?.toolNameSignature === firstTurn.toolNameSignature
      && (turns[start + streakLength]?.errorCount ?? 0) > 0
      && (turns[start + streakLength]?.successCount ?? 0) === 0
    ) {
      streakLength += 1;
    }

    if (streakLength === 0 || streakLength > maxErrorStreak) {
      continue;
    }

    const recoverySearchEnd = Math.min(turns.length, start + streakLength + maxTurnsUntilRecovery);
    for (let recoveryIndex = start + streakLength; recoveryIndex < recoverySearchEnd; recoveryIndex += 1) {
      const recoveryTurn = turns[recoveryIndex];
      if (
        recoveryTurn?.toolNameSignature === firstTurn.toolNameSignature
        && (recoveryTurn.successCount ?? 0) > 0
      ) {
        return true;
      }
    }
  }

  return false;
}

function normalizeNoveltyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/_:.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractTargetNoveltyValues(inputSignature: string): string[] {
  const preferredKeys = new Set(['query', 'path', 'url', 'target', 'file', 'pattern', 'glob', 'command']);
  const values: string[] = [];

  const visit = (candidate: unknown, keyHint?: string) => {
    if (candidate == null) return;
    if (typeof candidate === 'string') {
      if (!keyHint || preferredKeys.has(keyHint)) {
        const normalized = normalizeNoveltyText(candidate);
        if (normalized) values.push(`${keyHint ?? 'text'}:${normalized}`);
      }
      return;
    }
    if (typeof candidate === 'number' || typeof candidate === 'boolean') {
      if (keyHint && preferredKeys.has(keyHint)) {
        values.push(`${keyHint}:${String(candidate)}`);
      }
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, keyHint);
      return;
    }
    if (typeof candidate === 'object') {
      for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
        visit(value, key);
      }
    }
  };

  try {
    const parsed = JSON.parse(inputSignature) as unknown;
    visit(parsed);
  } catch {
    return [];
  }

  return [...new Set(values)];
}

function hasMeaningfulSameToolNovelty(
  turns: Array<{ toolNameSignature: string; inputSignature: string }>,
  minDistinctTargets = 2,
): boolean {
  const toolNames = new Set(turns.map((turn) => turn.toolNameSignature));
  if (toolNames.size !== 1) {
    return false;
  }

  const targetValues = new Set<string>();
  for (const turn of turns) {
    for (const value of extractTargetNoveltyValues(turn.inputSignature)) {
      targetValues.add(value);
    }
  }

  return targetValues.size >= minDistinctTargets;
}

function tokenCount(value: string): number {
  return normalizeNoveltyText(value)
    .split(' ')
    .filter(Boolean)
    .length;
}

function hasMonotonicSameToolNarrowing(
  turns: Array<{ toolNameSignature: string; inputSignature: string; successCount: number; errorCount: number }>,
  minDistinctTargets = 3,
): boolean {
  const toolNames = new Set(turns.map((turn) => turn.toolNameSignature));
  if (toolNames.size !== 1) {
    return false;
  }

  if (turns.some((turn) => turn.errorCount > 0 || turn.successCount > 0)) {
    // Require soft/non-terminal results only: no hard errors, and no fully successful completion signal.
    if (turns.some((turn) => turn.errorCount > 0)) {
      return false;
    }
  }

  const primaryTargets = turns
    .map((turn) => extractTargetNoveltyValues(turn.inputSignature).sort()[0] ?? '')
    .filter(Boolean);

  const distinctTargets = new Set(primaryTargets);
  if (primaryTargets.length !== turns.length || distinctTargets.size < minDistinctTargets) {
    return false;
  }

  let narrowingSteps = 0;
  for (let i = 1; i < primaryTargets.length; i += 1) {
    const prev = primaryTargets[i - 1]!;
    const next = primaryTargets[i]!;
    if (next !== prev && tokenCount(next) >= tokenCount(prev) && next.includes(prev.split(':', 2)[1] ?? '')) {
      narrowingSteps += 1;
    }
  }

  return narrowingSteps >= Math.max(2, turns.length - 2);
}

function getSessionReferenceIds(sessionPath: string): string[] {
  const rows = readJsonlRows(sessionPath);
  const refs = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>;
      const source = record.sourceToolAssistantUUID;
      const parent = record.parentUuid;
      if (typeof source === 'string' && source.trim()) refs.add(source);
      if (typeof parent === 'string' && parent.trim()) refs.add(parent);
    }
  }
  return [...refs];
}

function getAssistantIds(sessionPath: string): Set<string> {
  const rows = readJsonlRows(sessionPath);
  const ids = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>;
      if (record.type === 'assistant' && typeof record.uuid === 'string' && record.uuid.trim()) {
        ids.add(record.uuid);
      }
    }
  }
  return ids;
}

function buildChildMap(rootSessionPath: string, allFiles: string[]): Map<string, string[]> {
  const childMap = new Map<string, string[]>();
  const assistantIdsByPath = new Map(allFiles.map((file) => [file, getAssistantIds(file)]));
  for (const file of allFiles) childMap.set(file, []);

  for (const file of allFiles) {
    if (file === rootSessionPath) continue;
    const refs = getSessionReferenceIds(file);
    const parentPath = allFiles.find((candidate) => candidate !== file && refs.some((ref) => assistantIdsByPath.get(candidate)?.has(ref)));
    if (!parentPath) continue;
    childMap.set(parentPath, [...(childMap.get(parentPath) ?? []), file]);
  }

  return childMap;
}

function countTreeNodes(node: z.infer<typeof subagentTreeNodeSchema>): number {
  return 1 + node.children.reduce((sum, child) => sum + countTreeNodes(child), 0);
}

function buildSubagentTreeNode(sessionPath: string, childMap: Map<string, string[]>): z.infer<typeof subagentTreeNodeSchema> {
  const childPaths = childMap.get(sessionPath) ?? [];
  const summary = summarizeSessionLogs(sessionPath, []);
  const sessionId = path.basename(summary.sessionPath, path.extname(summary.sessionPath));
  const children = childPaths.map((childPath) => buildSubagentTreeNode(childPath, childMap));
  const estimatedCostUsd = Number(summary.totals.estimated_cost_usd.toFixed(6));
  const subtreeCost = Number((estimatedCostUsd + children.reduce((sum, child) => sum + child.subtreeCost, 0)).toFixed(6));
  return {
    sessionPath: summary.sessionPath,
    sessionId,
    estimatedCostUsd,
    subtreeCost,
    turnCount: summary.turns.length,
    inputTokens: summary.totals.input_tokens,
    outputTokens: summary.totals.output_tokens,
    children,
  };
}

export function getSessionCost(input: z.infer<typeof sessionRequestSchema>): SessionCostResult {
  const sessionPath = resolveSessionFile(input.sessionId, input.projectPath);
  const summary = summarizeSessionLogs(sessionPath);
  return sessionCostOutputSchema.parse(buildBudgetAwareSessionResult(summary));
}

export function getSubagentTree(input: z.infer<typeof subagentTreeRequestSchema>): SubagentTreeResult {
  const rootSessionPath = resolveSessionFile(input.sessionId, input.projectPath);
  const allFiles = collectJsonlFiles(input.projectPath);
  const childMap = buildChildMap(rootSessionPath, allFiles);
  const tree = buildSubagentTreeNode(rootSessionPath, childMap);
  const result = subagentTreeOutputSchema.parse({
    projectPath: resolveProjectPath(input.projectPath),
    rootSessionPath,
    totalSessions: countTreeNodes(tree),
    totalCostUsd: tree.subtreeCost,
    tree,
    _meta: {},
  });

  void getTelemetryClient().emit({
    type: 'forecast',
    source: 'get_subagent_tree',
    createdAt: new Date().toISOString(),
    payload: {
      projectPath: result.projectPath,
      rootSessionPath: result.rootSessionPath,
      totalSessions: result.totalSessions,
      totalCostUsd: result.totalCostUsd,
    },
  }).catch(() => undefined);

  return result;
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

export function getToolRoi(input: z.infer<typeof toolUsageRequestSchema>): ToolRoiResult {
  const usage = getToolUsage(input);
  const files = input.sessionId ? [resolveSessionFile(input.sessionId, input.projectPath)] : collectJsonlFiles(input.projectPath);
  const now = Date.now();
  const filteredFiles = files.filter((file) => {
    if (!input.days) return true;
    return now - statSync(file).mtimeMs <= input.days * DAY_MS;
  });

  const summaries = filteredFiles.map((file) => summarizeSessionLogs(file));
  const totalCostUsd = summaries.reduce((sum, summary) => sum + summary.totals.estimated_cost_usd, 0);
  const totalLinkedResults = usage.tools.reduce((sum, tool) => sum + tool.linkedResults, 0);

  const tools = usage.tools
    .map((tool) => {
      const estimatedCostShareUsd = totalCostUsd === 0 ? 0 : Number(((tool.contextSharePercent / 100) * totalCostUsd).toFixed(6));
      const goalProgressScore = totalLinkedResults === 0 ? 0 : Number(((tool.linkedResults / totalLinkedResults) * 100).toFixed(1));
      const roiScore = Number((goalProgressScore - tool.contextSharePercent).toFixed(1));
      const efficiency = roiScore >= 10 ? 'high' : roiScore >= -10 ? 'medium' : 'low';
      return {
        ...tool,
        estimatedCostShareUsd,
        goalProgressScore,
        roiScore,
        efficiency,
      };
    })
    .sort((a, b) => a.roiScore - b.roiScore || b.estimatedCostShareUsd - a.estimatedCostShareUsd || a.name.localeCompare(b.name));

  return toolRoiOutputSchema.parse({
    projectPath: usage.projectPath,
    sessionCount: usage.sessionCount,
    tools,
    _meta: {},
  });
}

export function getCostTrend(input: z.infer<typeof costTrendRequestSchema>): CostTrendResult {
  const files = collectJsonlFiles(input.projectPath);
  const now = Date.now();
  const dailyMap = new Map<string, { sessions: number; costUsd: number; inputTokens: number; outputTokens: number }>();

  for (const file of files) {
    const dailySlices = readDailyCostSlices(file, now, input.days);

    if (dailySlices.length === 0) {
      const stats = statSync(file);
      if (now - stats.mtimeMs > input.days * DAY_MS) {
        continue;
      }
      const date = new Date(stats.mtimeMs).toISOString().slice(0, 10);
      const summary = summarizeSessionLogs(file);
      const prev = dailyMap.get(date) ?? { sessions: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
      prev.sessions += 1;
      prev.costUsd = Number((prev.costUsd + summary.totals.estimated_cost_usd).toFixed(8));
      prev.inputTokens += summary.totals.input_tokens;
      prev.outputTokens += summary.totals.output_tokens;
      dailyMap.set(date, prev);
      continue;
    }

    for (const slice of dailySlices) {
      const prev = dailyMap.get(slice.date) ?? { sessions: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
      prev.sessions += slice.sessions;
      prev.costUsd = Number((prev.costUsd + slice.costUsd).toFixed(8));
      prev.inputTokens += slice.inputTokens;
      prev.outputTokens += slice.outputTokens;
      dailyMap.set(slice.date, prev);
    }
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
    void getTelemetryClient().emit({
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  const weight = idx - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function roundUsd(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function readDailyCostSlices(file: string, now: number, days: number) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const perDay = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number; sessions: Set<string> }>();

  for (const line of lines) {
    const record = JSON.parse(line) as Record<string, any>;
    const type = String(record.type ?? record.message_type ?? record.role ?? '').toLowerCase();
    if (!type.includes('assistant')) continue;

    const timestamp = String(record.timestamp ?? record.created_at ?? record.createdAt ?? '');
    const when = timestamp ? new Date(timestamp) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    if (now - when.getTime() > days * DAY_MS) continue;

    const date = when.toISOString().slice(0, 10);
    const usage = record.usage ?? record.message?.usage ?? {};
    const costUsd = estimateCostUsd(
      String(record.model ?? record.message?.model ?? 'unknown'),
      {
        input_tokens: Number(usage.input_tokens ?? 0),
        output_tokens: Number(usage.output_tokens ?? 0),
        cache_read_input_tokens: Number(usage.cache_read_input_tokens ?? 0),
        cache_creation_input_tokens: Number(usage.cache_creation_input_tokens ?? 0),
      },
      DEFAULT_PRICING_TABLE,
      () => {},
    );

    const prev = perDay.get(date) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0, sessions: new Set<string>() };
    prev.costUsd += costUsd;
    prev.inputTokens += Number(usage.input_tokens ?? 0);
    prev.outputTokens += Number(usage.output_tokens ?? 0);
    prev.sessions.add(file);
    perDay.set(date, prev);
  }

  return [...perDay.entries()].map(([date, value]) => ({
    date,
    sessions: value.sessions.size,
    costUsd: roundUsd(value.costUsd, 8),
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
  }));
}

function buildForecastConfidence(daily: CostTrendResult['daily'], forecastDays: number, projectedTotalUsd: number) {
  const nonZeroDailyCosts = daily
    .map((day) => day.costUsd)
    .filter((cost) => cost > 0)
    .sort((a, b) => a - b);
  const historyDaysConsidered = daily.length;
  const nonZeroDays = nonZeroDailyCosts.length;
  const q1 = roundUsd(percentile(nonZeroDailyCosts, 0.25));
  const median = roundUsd(percentile(nonZeroDailyCosts, 0.5));
  const q3 = roundUsd(percentile(nonZeroDailyCosts, 0.75));
  const bursty = nonZeroDays >= 2 && q1 > 0 && q3 / q1 >= 3;

  const reasonCodes: Array<
    'insufficient_non_zero_days' | 'short_history_window' | 'bursty_spend_pattern' | 'stable_spend_history'
  > = [];
  if (nonZeroDays < 2) reasonCodes.push('insufficient_non_zero_days');
  if (historyDaysConsidered < 7) reasonCodes.push('short_history_window');
  if (bursty) reasonCodes.push('bursty_spend_pattern');

  let level: 'low' | 'medium' | 'high' = 'medium';
  if (nonZeroDays < 2 || historyDaysConsidered < 3) {
    level = 'low';
  } else if (nonZeroDays >= 7 && historyDaysConsidered >= 7 && !bursty) {
    level = 'high';
    reasonCodes.push('stable_spend_history');
  }

  return {
    level,
    reason_codes: reasonCodes,
    history_days_considered: historyDaysConsidered,
    non_zero_days: nonZeroDays,
    q1_daily_cost_usd: q1,
    median_daily_cost_usd: median,
    q3_daily_cost_usd: q3,
    projected_range_usd: {
      low: Math.min(roundUsd(q1 * forecastDays), projectedTotalUsd),
      high: Math.max(roundUsd(q3 * forecastDays), projectedTotalUsd),
    },
  };
}

function maybeAdjustSparseForecast(params: {
  daily: CostTrendResult['daily'];
  forecastDays: number;
  baselineDailyCostUsd: number;
  projectedTotalUsd: number;
  forecastConfidence: ReturnType<typeof buildForecastConfidence>;
}) {
  const { daily, forecastDays, baselineDailyCostUsd, projectedTotalUsd, forecastConfidence } = params;
  const nonZeroDailyCosts = daily
    .map((day) => day.costUsd)
    .filter((cost) => cost > 0)
    .sort((a, b) => a - b);
  const nonZeroTotal = nonZeroDailyCosts.reduce((sum, cost) => sum + cost, 0);
  const maxShare = nonZeroTotal === 0 ? 0 : Math.max(...nonZeroDailyCosts) / nonZeroTotal;
  const quartileInstability = forecastConfidence.q1_daily_cost_usd > 0
    && forecastConfidence.q3_daily_cost_usd / forecastConfidence.q1_daily_cost_usd >= 3;
  const sparseHistory = forecastConfidence.non_zero_days <= 2
    || forecastConfidence.history_days_considered <= 2
    || quartileInstability
    || (maxShare > 0.6 && forecastConfidence.history_days_considered <= 2);

  if (!sparseHistory || baselineDailyCostUsd === 0) {
    return {
      adjustment_mode: 'none' as const,
      adjusted_point_estimate_usd: undefined,
      unadjusted_point_estimate_usd: undefined,
      projectedTotalUsd,
      projectedMonthlyUsd: roundUsd(baselineDailyCostUsd * 30),
    };
  }

  const adjustedDailyBaseline = roundUsd(
    Math.max(
      forecastConfidence.q1_daily_cost_usd,
      Math.min(baselineDailyCostUsd, forecastConfidence.median_daily_cost_usd || baselineDailyCostUsd),
    ),
    6,
  );

  return {
    adjustment_mode: 'sparse_history_fallback_v1' as const,
    adjusted_point_estimate_usd: roundUsd(adjustedDailyBaseline * forecastDays),
    unadjusted_point_estimate_usd: projectedTotalUsd,
    projectedTotalUsd: roundUsd(adjustedDailyBaseline * forecastDays),
    projectedMonthlyUsd: roundUsd(adjustedDailyBaseline * 30),
  };
}

export function getCostForecast(input: z.infer<typeof costForecastRequestSchema>): CostForecastResult {
  let trend: CostTrendResult | null = null;
  try {
    trend = getCostTrend({ projectPath: input.projectPath, days: input.lookbackDays });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('No session log files (*.jsonl) found')) {
      throw error;
    }
  }

  const projectPath = resolveProjectPath(input.projectPath);
  const observedDays = trend ? trend.daily.length : 0;
  const weightedBaseline = !trend || observedDays === 0
    ? 0
    : trend.daily.reduce((sum, day, index) => {
        const weight = index + 1;
        return sum + (day.costUsd * weight);
      }, 0) / trend.daily.reduce((sum, _day, index) => sum + index + 1, 0);
  const baselineDailyCostUsd = roundUsd(weightedBaseline, 6);
  const unadjustedProjectedTotalUsd = roundUsd(baselineDailyCostUsd * input.forecastDays);
  const forecastConfidence = buildForecastConfidence(trend?.daily ?? [], input.forecastDays, unadjustedProjectedTotalUsd);
  const adjustment = maybeAdjustSparseForecast({
    daily: trend?.daily ?? [],
    forecastDays: input.forecastDays,
    baselineDailyCostUsd,
    projectedTotalUsd: unadjustedProjectedTotalUsd,
    forecastConfidence,
  });
  const assumptions = [
    'Forecast uses a deterministic recency-weighted daily average across the local lookback window.',
    'rc.2 remains non-seasonal and local-first; seasonal modeling is intentionally deferred.',
  ];
  if (observedDays === 0) {
    assumptions.push('No recent daily data was available, so the forecast falls back to zero baseline.');
  } else if (observedDays < input.lookbackDays) {
    assumptions.push(`Only ${observedDays} day(s) in the lookback window had observable session activity.`);
  }

  const result = costForecastOutputSchema.parse({
    projectPath,
    lookbackDays: input.lookbackDays,
    forecastDays: input.forecastDays,
    baselineDailyCostUsd,
    projectedTotalUsd: adjustment.projectedTotalUsd,
    projectedMonthlyUsd: adjustment.projectedMonthlyUsd,
    method: 'recency-weighted-average-rc2',
    confidence: forecastConfidence.level,
    adjustment_mode: adjustment.adjustment_mode,
    adjusted_point_estimate_usd: adjustment.adjusted_point_estimate_usd,
    unadjusted_point_estimate_usd: adjustment.unadjusted_point_estimate_usd,
    forecast_confidence: forecastConfidence,
    assumptions,
    _meta: {},
  });

  void getTelemetryClient().emit({
    type: 'forecast',
    source: 'get_cost_forecast',
    createdAt: new Date().toISOString(),
    payload: {
      projectPath: result.projectPath,
      lookbackDays: result.lookbackDays,
      forecastDays: result.forecastDays,
      baselineDailyCostUsd: result.baselineDailyCostUsd,
      projectedTotalUsd: result.projectedTotalUsd,
      projectedMonthlyUsd: result.projectedMonthlyUsd,
      confidence: result.confidence,
    },
  }).catch(() => undefined);

  return result;
}

export function setMonitorWebhook(input: z.infer<typeof monitorWebhookRequestSchema>) {
  saveMonitorWebhookConfig(input);
  return monitorWebhookOutputSchema.parse({ ok: true, url: input.url, configured: true });
}

export function estimateRunCost(input: z.infer<typeof estimateRunRequestSchema>): EstimateRunResult {
  const pricingModel = DEFAULT_PRICING_TABLE[input.model] ? input.model : findNearestPricingModel(input.model, DEFAULT_PRICING_TABLE);
  const promptTokens = input.prompt_tokens;
  const expectedOutputTokens = input.expected_output_tokens;
  const cachedInputTokens = input.cached_input_tokens ?? 0;
  const newInputTokens = input.new_input_tokens ?? Math.max(0, promptTokens - cachedInputTokens);

  if (cachedInputTokens > promptTokens) {
    throw new Error('cached_input_tokens cannot exceed prompt_tokens');
  }
  if (input.new_input_tokens !== undefined && input.new_input_tokens + cachedInputTokens != promptTokens) {
    throw new Error('new_input_tokens plus cached_input_tokens must equal prompt_tokens');
  }

  const estimateUsd = estimateCostUsd(
    input.model,
    {
      input_tokens: newInputTokens,
      output_tokens: expectedOutputTokens,
      cache_read_input_tokens: cachedInputTokens,
      cache_creation_input_tokens: 0,
    },
    DEFAULT_PRICING_TABLE,
    () => {},
  );

  const assumptions = [
    'Estimate uses the local pricing config and current nearest-model fallback rules.',
    'cache_creation_input_tokens are assumed to be zero for pre-run estimation unless modeled separately later.',
  ];
  if (input.new_input_tokens === undefined) {
    assumptions.push('new_input_tokens were inferred as prompt_tokens minus cached_input_tokens.');
  }
  if (!DEFAULT_PRICING_TABLE[input.model]) {
    assumptions.push(`Unknown model '${input.model}' falls back to pricing from '${pricingModel}'.`);
  }

  return estimateRunOutputSchema.parse({
    model: input.model,
    provider: inferProviderFromModel(input.model),
    pricingModel,
    estimateUsd,
    promptTokens,
    expectedOutputTokens,
    cachedInputTokens,
    newInputTokens,
    withinBudget: input.budget_usd !== undefined ? estimateUsd <= input.budget_usd : undefined,
    budgetUsd: input.budget_usd,
    assumptions,
    _meta: {},
  });
}

export function detectCostAnomalies(input: z.infer<typeof anomalyRequestSchema>): AnomalyResult {
  const trend = getCostTrend({ projectPath: input.projectPath, days: input.days });
  const now = Date.now();
  const files = collectJsonlFiles(input.projectPath).filter((file) => now - statSync(file).mtimeMs <= input.days * DAY_MS);
  const runawayWindow = input.recentTurnWindow;

  let runawayDetected = false;
  let runawaySignature: string | undefined;
  let runawayReasonCode: 'identical_signature_no_progress' | 'alternating_cycle_no_progress' | 'retry_storm_no_adaptation' | undefined;
  let suggestedAction: string | undefined;

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const turns: Array<{
      signature: string;
      toolNameSignature: string;
      inputSignature: string;
      successCount: number;
      errorCount: number;
    }> = [];
    let pendingTurn: (typeof turns)[number] | null = null;

    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, any>;
      const type = String(record.type ?? record.message_type ?? record.role ?? '').toLowerCase();
      const content = record.message?.content ?? record.content ?? [];
      if (!Array.isArray(content)) continue;

      if (type.includes('assistant')) {
        const toolUses = content.filter((item) => item?.type === 'tool_use');
        if (toolUses.length === 0) continue;
        const toolNameSignature = toolUses.map((item) => String(item.name ?? 'unknown')).sort().join(',');
        const inputSignature = JSON.stringify(toolUses.map((item) => item?.input ?? null));
        pendingTurn = {
          signature: `${toolNameSignature}::${inputSignature}`,
          toolNameSignature,
          inputSignature,
          successCount: 0,
          errorCount: 0,
        };
        turns.push(pendingTurn);
        continue;
      }

      if (type.includes('user') && pendingTurn) {
        const toolResults = content.filter((item) => item?.type === 'tool_result');
        for (const item of toolResults) {
          if (item?.is_error === true) {
            pendingTurn.errorCount += 1;
          } else {
            pendingTurn.successCount += 1;
          }
        }
      }
    }

    const recent = turns.slice(-runawayWindow);
    if (recent.length !== runawayWindow) continue;

    const allNoSuccess = recent.every((entry) => entry.successCount === 0);
    const allSameSignature = recent.every((entry) => entry.signature === recent[0]?.signature);
    const repeatedHardErrors = recent.every((entry) => entry.errorCount > 0);
    const alternatingTwoSignatureCycle = recent.every((entry, index) => entry.signature === recent[index % 2]?.signature)
      && new Set(recent.map((entry) => entry.signature)).size === 2;
    const recoveredTransientFailure = hasBoundedRecoveryAfterTransientFailure(recent);
    const sameToolOnly = new Set(recent.map((entry) => entry.toolNameSignature)).size === 1;
    const meaningfulSameToolNovelty = hasMeaningfulSameToolNovelty(recent);
    const monotonicSameToolNarrowing = hasMonotonicSameToolNarrowing(recent);
    const likelySameToolDeadEnd = sameToolOnly && (allSameSignature || (!meaningfulSameToolNovelty && !monotonicSameToolNarrowing));

    if (!recoveredTransientFailure && allNoSuccess && likelySameToolDeadEnd) {
      runawayDetected = true;
      runawaySignature = recent[0]?.toolNameSignature;
      runawayReasonCode = repeatedHardErrors ? 'retry_storm_no_adaptation' : 'identical_signature_no_progress';
      suggestedAction = repeatedHardErrors
        ? `Stop the repeated failing loop around '${runawaySignature}', then adapt the query, back off retries, or hand control to a human.`
        : `Stop or re-scope the repeated tool loop around '${runawaySignature}', then inspect why ${runawayWindow} recent turns produced no successful tool-result progress.`;
      break;
    }

    if (!recoveredTransientFailure && allNoSuccess && alternatingTwoSignatureCycle) {
      runawayDetected = true;
      runawaySignature = [...new Set(recent.map((entry) => entry.toolNameSignature))].join(' -> ');
      runawayReasonCode = 'alternating_cycle_no_progress';
      suggestedAction = `Stop the alternating loop around '${runawaySignature}', then inspect why the last ${runawayWindow} turns kept cycling without successful progress.`;
      break;
    }

  }

  if (trend.daily.length === 0) {
    const result = anomalyOutputSchema.parse({
      projectPath: trend.projectPath,
      days: input.days,
      baselineDailyCostUsd: 0,
      anomalies: [],
      runaway_detected: runawayDetected,
      runaway_signature: runawaySignature,
      runaway_reason_code: runawayReasonCode,
      suggested_action: suggestedAction,
      _meta: {},
    });

    void getTelemetryClient().emit({
      type: 'anomaly',
      source: 'detect_cost_anomalies',
      createdAt: new Date().toISOString(),
      payload: {
        projectPath: result.projectPath,
        days: result.days,
        baselineDailyCostUsd: result.baselineDailyCostUsd,
        anomalyCount: result.anomalies.length,
        runawayDetected: result.runaway_detected,
        runawaySignature: result.runaway_signature,
        runawayReasonCode: result.runaway_reason_code,
      },
    }).catch(() => undefined);

    return result;
  }

  const baselineDailyCostUsdRaw = trend.totalCostUsd / trend.daily.length;
  const positiveCostDays = trend.daily.filter((day) => day.costUsd > 0);
  const positiveCostBaselineUsd =
    positiveCostDays.length > 0
      ? positiveCostDays.reduce((sum, day) => sum + day.costUsd, 0) / positiveCostDays.length
      : 0;
  const roundedBaselineDailyCostUsd = Number(baselineDailyCostUsdRaw.toFixed(6));
  const roundedPositiveCostBaselineUsd = Number(positiveCostBaselineUsd.toFixed(6));
  const baselineDailyCostUsd =
    roundedBaselineDailyCostUsd > 0 || positiveCostDays.length === 0
      ? roundedBaselineDailyCostUsd
      : roundedPositiveCostBaselineUsd > 0
        ? roundedPositiveCostBaselineUsd
        : positiveCostBaselineUsd;
  const anomalies = trend.daily
    .filter((day) => day.costUsd >= input.minDailyCostUsd)
    .map((day) => {
      const deviationUsd = Number((day.costUsd - baselineDailyCostUsd).toFixed(6));
      const deviationPercent = baselineDailyCostUsd === 0 ? 0 : Number(((deviationUsd / baselineDailyCostUsd) * 100).toFixed(1));
      const absDeviationPercent = Math.abs(deviationPercent);
      if (absDeviationPercent < 50 && Math.abs(deviationUsd) < 0.01) {
        return null;
      }
      const severity = absDeviationPercent >= 100 || Math.abs(deviationUsd) >= 0.05 ? 'high' : 'medium';
      const direction = deviationUsd >= 0 ? 'above' : 'below';
      return {
        date: day.date,
        costUsd: day.costUsd,
        sessions: day.sessions,
        deviationUsd,
        deviationPercent,
        severity,
        reason: `Daily spend is ${Math.abs(deviationPercent).toFixed(1)}% ${direction} the observed ${input.days}-day baseline.`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent) || b.costUsd - a.costUsd);

  const result = anomalyOutputSchema.parse({
    projectPath: trend.projectPath,
    days: input.days,
    baselineDailyCostUsd,
    anomalies,
    runaway_detected: runawayDetected,
    runaway_signature: runawaySignature,
    runaway_reason_code: runawayReasonCode,
    suggested_action: suggestedAction,
    _meta: {},
  });

  void getTelemetryClient().emit({
    type: 'anomaly',
    source: 'detect_cost_anomalies',
    createdAt: new Date().toISOString(),
    payload: {
      projectPath: result.projectPath,
      days: result.days,
      baselineDailyCostUsd: result.baselineDailyCostUsd,
      anomalyCount: result.anomalies.length,
      runawayDetected: result.runaway_detected,
      runawaySignature: result.runaway_signature,
      runawayReasonCode: result.runaway_reason_code,
    },
  }).catch(() => undefined);

  return result;
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
        'Set deterministic daily/session budget caps and alert thresholds for local cost guardrails. Does NOT enforce billing-side spend limits or notify external systems.',
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
        'Get a single Claude Code session cost summary with token totals and estimated USD cost from a session log. Does NOT fetch remote billing data, reconcile invoices, or infer missing logs.',
      inputSchema: sessionRequestSchema.shape,
      outputSchema: sessionCostOutputSchema.shape,
    },
    async (input) => makeToolResponse(getSessionCost(sessionRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_tool_usage',
    {
      description:
        'Inspect which tools appear most often across one session or a filtered project log directory to spot context-heavy patterns. Does NOT measure per-tool token usage precisely or inspect live Claude Code sessions.',
      inputSchema: toolUsageRequestSchema.shape,
      outputSchema: toolUsageOutputSchema.shape,
    },
    async (input) => makeToolResponse(getToolUsage(toolUsageRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_subagent_tree',
    {
      description:
        'Show a bounded parent-plus-subagent session tree for one local Claude Code session so nested cost attribution is easier to inspect. Does NOT infer hidden lineage beyond the available local JSONL files or reconstruct remote orchestration state.',
      inputSchema: subagentTreeRequestSchema.shape,
      outputSchema: subagentTreeOutputSchema.shape,
    },
    async (input) => makeToolResponse(getSubagentTree(subagentTreeRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_tool_roi',
    {
      description:
        'Rank tools by a bounded heuristic ROI view using context share, linked result share, and estimated cost share from parsed local sessions. Does NOT claim exact per-tool billing attribution or infer true business value.',
      inputSchema: toolUsageRequestSchema.shape,
      outputSchema: toolRoiOutputSchema.shape,
    },
    async (input) => makeToolResponse(getToolRoi(toolUsageRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_cost_trend',
    {
      description:
        'Roll session logs into a day-by-day cost trend for a local project path so you can watch spend move over time. Does NOT predict future spend, sync cloud analytics, or backfill missing timestamp history.',
      inputSchema: costTrendRequestSchema.shape,
      outputSchema: trendOutputSchema.shape,
    },
    async (input) => makeToolResponse(getCostTrend(costTrendRequestSchema.parse(input))),
  );

  server.registerTool(
    'get_cost_forecast',
    {
      description:
        'Project a bounded local cost forecast from recent daily trend data so you can estimate upcoming spend. The forecast is deterministic, recency-weighted, non-seasonal, and local-first; confidence metadata and sparse-history adjustment may appear, but it does NOT model seasonality, external events, or remote billing feeds.',
      inputSchema: costForecastRequestSchema.shape,
      outputSchema: costForecastOutputSchema.shape,
    },
    async (input) => makeToolResponse(getCostForecast(costForecastRequestSchema.parse(input))),
  );

  server.registerTool(
    'detect_cost_anomalies',
    {
      description:
        'Flag unusually high or low daily cost spikes against the recent local baseline for a project. Does NOT stream alerts continuously, infer root cause automatically, or act as a longer-term monitoring system.',
      inputSchema: anomalyRequestSchema.shape,
      outputSchema: anomalyOutputSchema.shape,
    },
    async (input) => makeToolResponse(detectCostAnomalies(anomalyRequestSchema.parse(input))),
  );

  server.registerTool(
    'estimate_run_cost',
    {
      description:
        'Estimate the likely cost of a planned run before execution using prompt/output token assumptions and cache reuse. Does NOT inspect live runs, predict tool-level ROI, or model cache-creation writes beyond the bounded assumptions in the result.',
      inputSchema: estimateRunRequestSchema.shape,
      outputSchema: estimateRunOutputSchema.shape,
    },
    async (input) => makeToolResponse(estimateRunCost(estimateRunRequestSchema.parse(input))),
  );

  server.registerTool(
    'set_monitor_webhook',
    {
      description:
        'Configure an alert webhook target for signed monitor events such as forecast/anomaly/cap notifications. Does NOT test the remote endpoint or manage webhook history.',
      inputSchema: monitorWebhookRequestSchema.shape,
      outputSchema: monitorWebhookOutputSchema.shape,
    },
    async (input) => makeToolResponse(setMonitorWebhook(monitorWebhookRequestSchema.parse(input))),
  );

  server.registerTool(
    'suggest_optimizations',
    {
      description:
        'Generate lightweight optimization suggestions from one parsed session log after cost or tool-usage review. Does NOT rewrite prompts automatically, inspect source code, or stand in for a full human performance audit.',
      inputSchema: sessionRequestSchema.shape,
      outputSchema: suggestionsOutputSchema.shape,
    },
    async (input) => makeToolResponse(suggestOptimizations(sessionRequestSchema.parse(input))),
  );
}
