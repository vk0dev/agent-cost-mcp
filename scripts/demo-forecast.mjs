#!/usr/bin/env node
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { getCostForecast } from '../dist/tools/index.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const NOW_ISO = '2026-05-06T12:00:00.000Z';

function dailyAssistantRow(timestamp, inputTokens, outputTokens, model = 'claude-sonnet-4') {
  return {
    type: 'assistant',
    timestamp,
    model,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    message: { content: [] },
  };
}

function writeSession(projectPath, name, rows) {
  const filePath = path.join(projectPath, name);
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const stamped = rows.find((row) => typeof row.timestamp === 'string')?.timestamp;
  if (stamped) {
    const when = new Date(stamped);
    utimesSync(filePath, when, when);
  }
}

function createDemoProject() {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-forecast-demo-'));
  writeSession(projectPath, 'day-1.jsonl', [dailyAssistantRow('2026-05-02T15:00:00.000Z', 220000, 44000)]);
  writeSession(projectPath, 'day-2.jsonl', [dailyAssistantRow('2026-05-03T15:00:00.000Z', 250000, 50000)]);
  writeSession(projectPath, 'day-3.jsonl', [dailyAssistantRow('2026-05-04T15:00:00.000Z', 240000, 48000)]);
  writeSession(projectPath, 'day-4.jsonl', [dailyAssistantRow('2026-05-05T15:00:00.000Z', 230000, 46000)]);
  return projectPath;
}

function estimateCapHit(nowIso, currentSpendUsd, capUsd, baselineDailyCostUsd) {
  const remainingUsd = Math.max(capUsd - currentSpendUsd, 0);
  if (baselineDailyCostUsd <= 0) {
    return {
      remainingUsd,
      daysUntilCap: Infinity,
      capHitIso: null,
    };
  }

  const daysUntilCap = remainingUsd / baselineDailyCostUsd;
  const capHitMs = new Date(nowIso).getTime() + daysUntilCap * 24 * 60 * 60 * 1000;
  return {
    remainingUsd,
    daysUntilCap,
    capHitIso: new Date(capHitMs).toISOString(),
  };
}

const out = async (line = '', ms = 420) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  const projectPath = createDemoProject();
  try {
    await out(`${DIM}# Forecast the next two weeks from a reproducible local four-day spend window.${RESET}`, 1100);
    await out(`${BOLD}$ get_cost_forecast lookback=7 forecast=14${RESET}`, 700);
    await out(`${DIM}  project: ${projectPath}${RESET}`, 800);
    await out();

    const forecast = getCostForecast({ projectPath, lookbackDays: 7, forecastDays: 14 });
    const budgetCapUsd = 30;
    const currentSpendUsd = 18.4;
    const capHit = estimateCapHit(NOW_ISO, currentSpendUsd, budgetCapUsd, forecast.baselineDailyCostUsd);

    await out(`${CYAN}${BOLD}>>> baseline_daily_usd${RESET} ${forecast.baselineDailyCostUsd.toFixed(2)}`, 700);
    await out(`${CYAN}${BOLD}>>> projected_total_14d${RESET} ${GREEN}$${forecast.projectedTotalUsd.toFixed(2)}${RESET}`, 900);
    await out(`${CYAN}${BOLD}>>> projected_monthly_usd${RESET} ${GREEN}$${forecast.projectedMonthlyUsd.toFixed(2)}${RESET}`, 900);
    await out(`${CYAN}${BOLD}>>> confidence${RESET} ${forecast.forecast_confidence.level} ${JSON.stringify(forecast.forecast_confidence.reason_codes)}`, 1200);
    await out();
    await out(`${BOLD}Budget cap check:${RESET} current month spend $${currentSpendUsd.toFixed(2)} / cap $${budgetCapUsd.toFixed(2)}`, 1100);
    await out(`  remaining budget: $${capHit.remainingUsd.toFixed(2)}`, 900);
    await out(`  estimated cap-hit in: ${capHit.daysUntilCap.toFixed(1)} day(s)`, 900);
    await out(`  estimated cap-hit at: ${GREEN}${capHit.capHitIso}${RESET}`, 1200);
    await out();
    await out(`${GREEN}${BOLD}Forecast demo complete:${RESET} operator can inspect both spend direction and likely cap-hit timing at a glance.`, 1500);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
