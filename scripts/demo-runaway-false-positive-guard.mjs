#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { registerTools } from '../dist/tools/index.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

class FakeServer {
  constructor() { this.handlers = new Map(); }
  registerTool(name, _config, handler) { this.handlers.set(name, handler); }
}

function assistantToolUseRecord(id, name, input) {
  return {
    type: 'assistant',
    timestamp: new Date().toISOString(),
    model: 'claude-sonnet-4',
    usage: {
      input_tokens: 1200,
      output_tokens: 220,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    message: { content: [{ type: 'tool_use', id, name, input }] },
  };
}

function userToolResultRecord(id, { text, isError = false }) {
  return {
    type: 'user',
    timestamp: new Date().toISOString(),
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] },
  };
}

function writeSessionLog(filePath, records) {
  writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function parseToolResult(result) {
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}

const out = async (line = '', ms = 420) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

async function main() {
  const server = new FakeServer();
  registerTools(server);

  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-monotonic-narrowing-'));
  writeSessionLog(path.join(projectPath, 'session-monotonic-narrowing.jsonl'), [
    assistantToolUseRecord('search-1', 'web_search', { query: 'claude code spend issue' }),
    userToolResultRecord('search-1', { text: 'broad discussion thread' }),
    assistantToolUseRecord('search-2', 'web_search', { query: 'claude code spend issue cache_read_tokens' }),
    userToolResultRecord('search-2', { text: 'partial clue about cache reads' }),
    assistantToolUseRecord('search-3', 'web_search', { query: 'claude code spend issue cache_read_tokens jsonl' }),
    userToolResultRecord('search-3', { text: 'partial clue about JSONL logs' }),
    assistantToolUseRecord('search-4', 'web_search', { query: 'claude code spend issue cache_read_tokens jsonl budget' }),
    userToolResultRecord('search-4', { text: 'budget guard mention' }),
    assistantToolUseRecord('search-5', 'web_search', { query: 'claude code spend issue cache_read_tokens jsonl budget webhook' }),
    userToolResultRecord('search-5', { text: 'webhook follow-up clue' }),
    assistantToolUseRecord('search-6', 'web_search', { query: 'claude code spend issue cache_read_tokens jsonl budget webhook threshold' }),
    userToolResultRecord('search-6', { text: 'threshold clue, still narrowing' }),
  ]);

  await out(`${DIM}# Same tool repeated, but the query keeps narrowing and useful clues keep landing.${RESET}`, 1100);
  await out(`${BOLD}$ detect_cost_anomalies recentTurnWindow=6${RESET}`, 700);
  await out(`${DIM}  project: ${projectPath}${RESET}`, 900);
  await out();

  const payload = parseToolResult(await server.handlers.get('detect_cost_anomalies')({
    projectPath,
    days: 7,
    minDailyCostUsd: 0,
    recentTurnWindow: 6,
  }));

  await out(`${CYAN}${BOLD}>>> runaway_detected${RESET} ${GREEN}${BOLD}${String(payload.runaway_detected)}${RESET}`, 900);
  await out(`${CYAN}${BOLD}>>> runaway_reason_code${RESET} ${YELLOW}${String(payload.runaway_reason_code ?? 'none')}${RESET}`, 900);
  await out(`${CYAN}${BOLD}>>> why${RESET} useful clues kept tightening the search scope`, 1300);
  await out();
  await out(`${GREEN}${BOLD}2.3.1 matters here:${RESET} productive same-tool refinement no longer trips a runaway false positive.`, 1700);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
