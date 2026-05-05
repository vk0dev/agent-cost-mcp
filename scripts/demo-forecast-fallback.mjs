#!/usr/bin/env node
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { getCostForecast } from '../dist/tools/index.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function writeSession(projectPath, name, rows) {
  const filePath = path.join(projectPath, name);
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const stamped = rows.find((row) => typeof row.timestamp === 'string')?.timestamp;
  if (stamped) {
    const when = new Date(stamped);
    utimesSync(filePath, when, when);
  }
}

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

const out = async (line = '', ms = 420) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-forecast-v23-'));
  writeSession(projectPath, 'day-a.jsonl', [dailyAssistantRow('2026-05-01T12:00:00.000Z', 2200, 400)]);
  writeSession(projectPath, 'day-b.jsonl', [dailyAssistantRow('2026-05-02T12:00:00.000Z', 18000, 3600)]);

  await out(`${DIM}# Sparse bursty history: one normal day, one spike.${RESET}`, 1100);
  await out(`${BOLD}$ get_cost_forecast lookback=30 forecast=1${RESET}`, 700);
  await out(`${DIM}  project: ${projectPath}${RESET}`, 900);
  await out();

  const forecast = getCostForecast({ projectPath, lookbackDays: 30, forecastDays: 1 });
  await out(`${CYAN}${BOLD}>>> method${RESET} ${forecast.method}`, 700);
  await out(`${CYAN}${BOLD}>>> confidence${RESET} ${YELLOW}${forecast.forecast_confidence.level}${RESET} ${JSON.stringify(forecast.forecast_confidence.reason_codes)}`, 1200);
  await out(`${CYAN}${BOLD}>>> adjustment_mode${RESET} ${GREEN}${forecast.adjustment_mode}${RESET}`, 1000);
  await out(`  unadjusted point estimate: ${BOLD}$${forecast.unadjusted_point_estimate_usd.toFixed(2)}${RESET}`, 900);
  await out(`  adjusted point estimate:   ${GREEN}${BOLD}$${forecast.adjusted_point_estimate_usd.toFixed(2)}${RESET}`, 1100);
  await out(`  projected range:           ${BOLD}$${forecast.forecast_confidence.projected_range_usd.low.toFixed(2)} - $${forecast.forecast_confidence.projected_range_usd.high.toFixed(2)}${RESET}`, 1300);
  await out();
  await out(`${GREEN}${BOLD}v2.3.0 matters here:${RESET} sparse history no longer blindly over-projects a spike.`, 1700);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
