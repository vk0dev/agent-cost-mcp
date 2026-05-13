#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { getSessionCost } from '../dist/tools/index.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function row(timestamp, model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens) {
  return {
    type: 'assistant',
    timestamp,
    model,
    usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens },
    message: { content: [] },
  };
}

const out = async (line = '', ms = 420) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-session-cost-'));
  const filePath = path.join(projectPath, 'session-main.jsonl');
  writeFileSync(filePath, [
    row(new Date().toISOString(), 'claude-sonnet-4', 2400, 420, 1800, 220),
    row(new Date().toISOString(), 'claude-sonnet-4', 5200, 1100, 2400, 300),
  ].map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');

  await out(`${DIM}# One local session log, parsed into concrete token totals and spend.${RESET}`, 1100);
  await out(`${BOLD}$ get_session_cost session-main.jsonl${RESET}`, 700);
  await out(`${DIM}  project: ${projectPath}${RESET}`, 900);
  await out();

  const payload = getSessionCost({ sessionId: 'session-main', projectPath });
  await out(`${CYAN}${BOLD}>>> turnCount${RESET} ${payload.turnCount}`, 700);
  await out(`${CYAN}${BOLD}>>> estimated_cost_usd${RESET} ${GREEN}${payload.totals.estimated_cost_usd.toFixed(4)}${RESET}`, 900);
  await out(`${CYAN}${BOLD}>>> input_tokens${RESET} ${payload.totals.input_tokens}`, 700);
  await out(`${CYAN}${BOLD}>>> output_tokens${RESET} ${payload.totals.output_tokens}`, 700);
  await out(`${CYAN}${BOLD}>>> cache_read_input_tokens${RESET} ${payload.totals.cache_read_input_tokens}`, 900);
  await out();
  await out(`${GREEN}${BOLD}What this proves:${RESET} one local JSONL session becomes a concrete cost snapshot without cloud telemetry.`, 1700);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
