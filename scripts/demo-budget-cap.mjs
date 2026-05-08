#!/usr/bin/env node
// Demo for Phase 5.4 threshold-crossing budget alerts.
// Re-record with:
//   asciinema rec -c "node scripts/demo-budget-cap.mjs" docs/demo-budget-cap.cast
//   agg --speed 1.25 --theme solarized-dark docs/demo-budget-cap.cast docs/demo-budget-cap.gif
import { existsSync, unlinkSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import { evaluateBudgetStatus, getBudgetStatePath, writeBudgetState } from '../dist/budget.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function out(line = '', ms = 450) {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
}

async function printJson(label, value, ms = 900) {
  await out(`${CYAN}${BOLD}${label}${RESET}`, 500);
  await out(JSON.stringify(value, null, 2), ms);
}

async function main() {
  const statePath = getBudgetStatePath();
  if (existsSync(statePath)) unlinkSync(statePath);

  await out(`${BOLD}$ agent-cost-mcp demo --budget-cap${RESET}`, 700);
  await out(`${DIM}Configuring a warn-mode budget with 80% alerts and a 100% hard cap.${RESET}`, 1200);

  const budget = writeBudgetState({
    daily_usd: 120,
    per_session_usd: 40,
    alert_thresholds: [50, 80, 100],
    mode: 'warn',
  });

  await printJson('Configured budget', budget, 1000);

  const beforeCross = evaluateBudgetStatus({
    budget,
    sessionCostUsd: 18.4,
    dailyCostUsd: 72.0,
  });
  await out(`${DIM}Before the crossing, the run is still below the 80% alert line.${RESET}`, 1200);
  await printJson('Status before crossing', beforeCross, 900);

  const crossed = evaluateBudgetStatus({
    budget,
    sessionCostUsd: 18.4,
    dailyCostUsd: 96.4,
  });
  await out(`${YELLOW}${BOLD}Threshold crossed:${RESET} daily spend just moved above the 80% alert threshold.`, 1500);
  await printJson('Status after crossing', crossed, 1100);

  if (crossed.budget_alert) {
    await out(`${YELLOW}${BOLD}Alert fired:${RESET} ${crossed.budget_alert.message}`, 1700);
  }

  const capped = evaluateBudgetStatus({
    budget,
    sessionCostUsd: 18.4,
    dailyCostUsd: 121.2,
  });
  await out(`${RED}${BOLD}Cap exceeded:${RESET} the budget is now above 100% of the configured daily cap.`, 1500);
  await printJson('Status at cap', capped, 1100);

  if (capped.hard_cap_message) {
    await out(`${RED}${BOLD}Hard-cap message:${RESET} ${capped.hard_cap_message}`, 1700);
  }

  await out(`${GREEN}${BOLD}Operator takeaway:${RESET} alerts start at the threshold crossing, then the hard-cap message appears once the cap is exceeded.`, 1900);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
