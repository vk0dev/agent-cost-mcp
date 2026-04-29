#!/usr/bin/env node
import { existsSync, unlinkSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import { evaluateBudgetStatus, getBudgetStatePath, readBudgetState, writeBudgetState } from '../dist/budget.js';

const out = async (line = '', ms = 350) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  const budgetPath = getBudgetStatePath();
  if (existsSync(budgetPath)) unlinkSync(budgetPath);

  await out('$ agent-cost-mcp demo --budget-cap');
  await out('Configuring a monthly team budget...');
  writeBudgetState({
    amountUsd: 120,
    period: 'month',
    updatedAt: '2026-04-29T08:20:00.000Z',
    currency: 'USD',
  });
  const saved = readBudgetState();
  await out(JSON.stringify(saved, null, 2), 500);

  await out('Evaluating current spend against the cap...');
  const status = evaluateBudgetStatus({
    totalCostUsd: 96.4,
    previousTotalCostUsd: 81.1,
    nowIso: '2026-04-29T08:20:00.000Z',
  });
  await out(JSON.stringify(status, null, 2), 650);

  await out('Budget cap demo complete.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
