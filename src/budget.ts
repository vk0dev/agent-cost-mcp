import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type BudgetState = {
  daily_usd?: number;
  per_session_usd?: number;
  alert_thresholds?: number[];
  updated_at: string;
};

export type BudgetAlert = {
  scope: 'daily' | 'session';
  threshold: number;
  percentUsed: number;
  limitUsd: number;
  currentUsd: number;
  message: string;
};

export type BudgetStatus = {
  budget_alert?: BudgetAlert;
  hard_capped: boolean;
  hard_cap_message?: string;
};

export function getBudgetStatePath(): string {
  return path.join(os.homedir(), '.agent-cost-mcp', 'budget-state.json');
}

export function readBudgetState(): BudgetState | null {
  const statePath = getBudgetStatePath();
  if (!existsSync(statePath)) return null;

  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as BudgetState;
  } catch {
    return null;
  }
}

export function writeBudgetState(input: {
  daily_usd?: number;
  per_session_usd?: number;
  alert_thresholds?: number[];
}): BudgetState {
  const statePath = getBudgetStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  const normalized: BudgetState = {
    daily_usd: input.daily_usd,
    per_session_usd: input.per_session_usd,
    alert_thresholds: [...(input.alert_thresholds ?? [50, 80, 100])].sort((a, b) => a - b),
    updated_at: new Date().toISOString(),
  };
  writeFileSync(statePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function evaluateBudgetStatus(params: {
  budget: BudgetState | null;
  sessionCostUsd: number;
  dailyCostUsd: number;
}): BudgetStatus {
  const { budget, sessionCostUsd, dailyCostUsd } = params;
  if (!budget) return { hard_capped: false };

  const thresholds = budget.alert_thresholds && budget.alert_thresholds.length > 0
    ? [...budget.alert_thresholds].sort((a, b) => a - b)
    : [50, 80, 100];

  const candidates: BudgetAlert[] = [];

  if (budget.per_session_usd && budget.per_session_usd > 0) {
    const percentUsed = (sessionCostUsd / budget.per_session_usd) * 100;
    const crossed = thresholds.filter((threshold) => percentUsed >= threshold).at(-1);
    if (crossed !== undefined) {
      candidates.push({
        scope: 'session',
        threshold: crossed,
        percentUsed,
        limitUsd: budget.per_session_usd,
        currentUsd: sessionCostUsd,
        message: `Session budget at ${percentUsed.toFixed(1)}% of $${budget.per_session_usd.toFixed(2)} cap.`,
      });
    }
  }

  if (budget.daily_usd && budget.daily_usd > 0) {
    const percentUsed = (dailyCostUsd / budget.daily_usd) * 100;
    const crossed = thresholds.filter((threshold) => percentUsed >= threshold).at(-1);
    if (crossed !== undefined) {
      candidates.push({
        scope: 'daily',
        threshold: crossed,
        percentUsed,
        limitUsd: budget.daily_usd,
        currentUsd: dailyCostUsd,
        message: `Daily budget at ${percentUsed.toFixed(1)}% of $${budget.daily_usd.toFixed(2)} cap.`,
      });
    }
  }

  const strongest = candidates.sort((a, b) => b.percentUsed - a.percentUsed)[0];
  const hardCapped = candidates.some((candidate) => candidate.percentUsed >= 100);

  return {
    budget_alert: strongest,
    hard_capped: hardCapped,
    hard_cap_message: hardCapped ? 'Configured budget cap reached or exceeded.' : undefined,
  };
}
