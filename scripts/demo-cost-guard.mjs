#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { getBudgetStatePath, writeBudgetState } from '../dist/budget.js';
import { detectCostAnomalies, getSessionCost, getToolRoi } from '../dist/tools/index.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const out = async (line = '', ms = 450) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

function assistantLine({ timestamp, input, output, cacheRead, cacheCreate, toolId, toolName, toolInput, text }) {
  return JSON.stringify({
    type: 'assistant',
    timestamp,
    model: 'claude-sonnet-4',
    usage: {
      input_tokens: input,
      output_tokens: output,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheCreate,
    },
    message: {
      content: [
        { type: 'text', text },
        { type: 'tool_use', id: toolId, name: toolName, input: toolInput },
      ],
    },
  });
}

function userLine({ timestamp, toolId, content = 'ok', isError = false }) {
  return JSON.stringify({
    type: 'user',
    timestamp,
    message: {
      content: [
        { type: 'tool_result', tool_use_id: toolId, content, is_error: isError },
      ],
    },
  });
}

function writeSession(filePath, lines, mtimeIso) {
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  const when = new Date(mtimeIso);
  utimesSync(filePath, when, when);
}

function buildDemoProject() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-guard-'));
  mkdirSync(dir, { recursive: true });

  const normalDays = [
    ['2026-04-20T10:00:00Z', 'Read'],
    ['2026-04-21T10:00:00Z', 'Edit'],
    ['2026-04-22T10:00:00Z', 'Read'],
    ['2026-04-23T10:00:00Z', 'Edit'],
  ];

  normalDays.forEach(([timestamp, tool], index) => {
    writeSession(
      path.join(dir, `day-${index + 1}.jsonl`),
      [
        assistantLine({
          timestamp,
          input: 1400 + index * 50,
          output: 320 + index * 15,
          cacheRead: 500 + index * 20,
          cacheCreate: 110 + index * 5,
          toolId: `ok-${index + 1}`,
          toolName: tool,
          toolInput: { path: `docs/file-${index + 1}.md` },
          text: 'routine productive work',
        }),
        userLine({ timestamp: new Date(new Date(timestamp).getTime() + 5000).toISOString(), toolId: `ok-${index + 1}`, content: 'applied successfully' }),
      ],
      timestamp,
    );
  });

  const runawayLines = [
    assistantLine({
      timestamp: '2026-04-25T03:00:00.000Z',
      input: 1500,
      output: 300,
      cacheRead: 500,
      cacheCreate: 100,
      toolId: 'seed-read',
      toolName: 'Read',
      toolInput: { path: 'README.md' },
      text: 'checking context before a risky change',
    }),
    userLine({
      timestamp: '2026-04-25T03:00:01.000Z',
      toolId: 'seed-read',
      content: 'context loaded',
    }),
  ];

  for (let i = 0; i < 10; i += 1) {
    const ts = new Date(Date.UTC(2026, 3, 25, 3, i + 1, 0)).toISOString();
    runawayLines.push(
      assistantLine({
        timestamp: ts,
        input: 42000 + i * 4000,
        output: 12000 + i * 600,
        cacheRead: 180000 + i * 15000,
        cacheCreate: 8000 + i * 500,
        toolId: `loop-${i + 1}`,
        toolName: 'Edit',
        toolInput: { file: 'src/worker.ts', patch: 'retry same change' },
        text: 'retrying same fix without adapting',
      }),
      userLine({
        timestamp: new Date(Date.parse(ts) + 1000).toISOString(),
        toolId: `loop-${i + 1}`,
        content: 'apply failed: context mismatch',
        isError: true,
      }),
    );
  }

  writeSession(path.join(dir, 'runaway-session.jsonl'), runawayLines, '2026-04-25T03:10:00Z');
  return dir;
}

async function main() {
  const demoProject = buildDemoProject();
  const budgetStatePath = getBudgetStatePath();

  writeBudgetState({ daily_usd: 5, per_session_usd: 3, alert_thresholds: [80, 100] });

  await out(`${DIM}# Cost Guard demo: anomaly trigger + budget cap = stop the agent${RESET}`, 1100);
  await out(`${DIM}# Local policy gate, no dashboard, no telemetry, no API key.${RESET}`, 1400);
  await out();

  await out(`${BOLD}$ configure_budget daily=$5 session=$3 thresholds=[80,100]${RESET}`, 700);
  await out(`${DIM}  persisted to ${budgetStatePath}${RESET}`, 1100);
  await out();

  await out(`${CYAN}${BOLD}>>> detect_cost_anomalies(project)${RESET}`, 700);
  const anomaly = detectCostAnomalies({ projectPath: demoProject, days: 14, recentTurnWindow: 8 });
  await out(`  baseline daily spend: ${BOLD}$${anomaly.baselineDailyCostUsd.toFixed(2)}${RESET}`, 850);
  await out(`  runaway_detected: ${RED}${BOLD}${String(anomaly.runaway_detected)}${RESET}`, 900);
  await out(`  reason: ${YELLOW}${anomaly.runaway_reason_code ?? 'n/a'}${RESET}`, 1200);
  await out();

  await out(`${CYAN}${BOLD}>>> get_tool_roi(runaway-session)${RESET}`, 700);
  const roi = getToolRoi({ sessionId: 'runaway-session', projectPath: demoProject });
  const worst = roi.tools[0];
  await out(`  worst tool: ${RED}${BOLD}${worst.name}${RESET}  calls=${worst.calls}  linked=${worst.linkedResults}  efficiency=${RED}${worst.efficiency}${RESET}`, 1400);
  await out(`  signal: repeated writes with no linked progress`, 1100);
  await out();

  await out(`${CYAN}${BOLD}>>> get_session_cost(runaway-session)${RESET}`, 700);
  const cost = getSessionCost({ sessionId: 'runaway-session', projectPath: demoProject });
  await out(`  session cost: ${RED}${BOLD}$${cost.totals.estimated_cost_usd.toFixed(2)}${RESET}`, 900);
  await out(`  budget alert: ${YELLOW}${BOLD}${cost.budget_alert?.message ?? 'none'}${RESET}`, 1300);
  await out(`  hard_capped: ${RED}${BOLD}${String(cost.hard_capped)}${RESET}`, 900);
  await out(`  hard_cap_message: ${RED}${cost.hard_cap_message ?? 'n/a'}${RESET}`, 1400);
  await out();

  await out(`${RED}${BOLD}POLICY GATE: STOP AUTONOMOUS RUN${RESET}`, 900);
  await out(`${BOLD}if anomaly_triggered && hard_capped:${RESET}`, 700);
  await out(`  ${RED}halt agent${RESET}`, 600);
  await out(`  ${YELLOW}summarize failure state${RESET}`, 600);
  await out(`  ${GREEN}ask human to raise cap or narrow scope${RESET}`, 1600);
  await out();
  await out(`${BOLD}${GREEN}agent-cost-mcp${RESET}${BOLD} doesn't just report spend.${RESET}`, 900);
  await out(`${BOLD}${GREEN}It gives the agent a clean reason to stop.${RESET}`, 1800);

  rmSync(demoProject, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
