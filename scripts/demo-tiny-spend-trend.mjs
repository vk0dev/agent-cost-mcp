#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { getCostTrend } from '../dist/tools/index.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function row(timestamp, model, input_tokens, output_tokens) {
  return {
    type: 'assistant',
    timestamp,
    model,
    usage: {
      input_tokens,
      output_tokens,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    message: { content: [] },
  };
}

function isoDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

const out = async (line = '', ms = 420) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-tiny-spend-'));
  writeFileSync(
    path.join(projectPath, 'tiny-positive-day.jsonl'),
    [
      row(isoDaysAgo(2), 'claude-haiku-3-5', 12, 4),
      row(isoDaysAgo(1), 'claude-haiku-3-5', 18, 6),
    ].map((x) => JSON.stringify(x)).join('\n') + '\n',
    'utf8'
  );

  await out(`${DIM}# Tiny positive spend should stay visible in daily trend output.${RESET}`, 1100);
  await out(`${BOLD}$ get_cost_trend days=7${RESET}`, 700);
  await out(`${DIM}  project: ${projectPath}${RESET}`, 900);
  await out();

  const payload = getCostTrend({ projectPath, days: 7 });
  await out(`${CYAN}${BOLD}>>> totalCostUsd${RESET} ${payload.totalCostUsd.toFixed(6)}`, 900);
  await out(`${CYAN}${BOLD}>>> daily${RESET} ${JSON.stringify(payload.daily, null, 2)}`, 1500);
  await out();
  await out(`${GREEN}${BOLD}2.3.3 matters here:${RESET} tiny real spend no longer disappears when trend data is aggregated.`, 1700);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
