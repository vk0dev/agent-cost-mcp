#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  detectCostAnomalies,
  estimateRunCost,
  getCostTrend,
  getToolRoi,
  getToolUsage,
} from '../dist/tools/index.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const out = async (line = '', ms = 420) => {
  process.stdout.write(`${line}\n`);
  await sleep(ms);
};

function isoDaysAgo(daysAgo, hour = 12, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function assistantLine({ timestamp, model = 'claude-sonnet-4', input, output, cacheRead = 0, cacheCreate = 0, toolId, toolName, toolInput, text }) {
  return JSON.stringify({
    type: 'assistant',
    timestamp,
    model,
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cost-tool-analytics-'));
  mkdirSync(dir, { recursive: true });

  const productiveSessions = [
    { day: 6, tool: 'Read', id: 'docs-scan', input: 3200, output: 600, result: 'readme inspected' },
    { day: 5, tool: 'Grep', id: 'search-api', input: 3900, output: 550, result: '4 matches found' },
    { day: 4, tool: 'Edit', id: 'patch-docs', input: 4600, output: 900, result: 'patch applied' },
    { day: 3, tool: 'Bash', id: 'run-tests', input: 5200, output: 1200, result: 'tests passed' },
  ];

  for (const session of productiveSessions) {
    const timestamp = isoDaysAgo(session.day);
    writeSession(
      path.join(dir, `${session.id}.jsonl`),
      [
        assistantLine({
          timestamp,
          input: session.input,
          output: session.output,
          cacheRead: 800,
          cacheCreate: 120,
          toolId: session.id,
          toolName: session.tool,
          toolInput: { path: `src/${session.id}.ts` },
          text: 'productive operator work',
        }),
        userLine({
          timestamp: new Date(Date.parse(timestamp) + 1000).toISOString(),
          toolId: session.id,
          content: session.result,
        }),
      ],
      timestamp,
    );
  }

  const spikeTime = isoDaysAgo(1, 16, 0);
  const spikeLines = [];
  for (let i = 0; i < 7; i += 1) {
    const timestamp = new Date(Date.parse(spikeTime) + i * 60_000).toISOString();
    spikeLines.push(
      assistantLine({
        timestamp,
        input: 38000 + i * 3000,
        output: 9000 + i * 500,
        cacheRead: 120000 + i * 10_000,
        cacheCreate: 6000,
        toolId: `retry-${i + 1}`,
        toolName: 'Edit',
        toolInput: { file: 'src/budget.ts', patch: 'retry same patch' },
        text: 'retrying same edit without new evidence',
      }),
      userLine({
        timestamp: new Date(Date.parse(timestamp) + 1000).toISOString(),
        toolId: `retry-${i + 1}`,
        content: 'patch failed: context mismatch',
        isError: true,
      }),
    );
  }
  writeSession(path.join(dir, 'retry-storm.jsonl'), spikeLines, spikeTime);

  return dir;
}

function money(value) {
  return `$${value.toFixed(2)}`;
}

async function main() {
  const projectPath = buildDemoProject();

  try {
    await out(`${DIM}# Tool analytics demo: usage mix -> trend -> ROI -> anomaly -> pre-run estimate.${RESET}`, 1000);
    await out(`${DIM}# Fixture-backed local Claude Code JSONL; no billing API, no telemetry.${RESET}`, 1100);
    await out(`${BOLD}$ agent-cost-mcp inspect ./local-session-logs${RESET}`, 650);
    await out(`${DIM}  project: ${projectPath}${RESET}`, 900);
    await out();

    const usage = getToolUsage({ projectPath, days: 7 });
    await out(`${CYAN}${BOLD}>>> get_tool_usage days=7${RESET}`, 650);
    for (const tool of usage.tools.slice(0, 4)) {
      await out(`  ${tool.name.padEnd(5)} calls=${String(tool.calls).padStart(2)} context=${tool.contextSharePercent.toFixed(1)}%`, 420);
    }
    await out();

    const trend = getCostTrend({ projectPath, days: 7 });
    await out(`${CYAN}${BOLD}>>> get_cost_trend days=7${RESET}`, 650);
    await out(`  sessions=${trend.totalSessions}  total=${BOLD}${money(trend.totalCostUsd)}${RESET}`, 620);
    const activeDays = trend.daily.filter((day) => day.sessions > 0);
    for (const day of activeDays.slice(-4)) {
      await out(`  ${day.date}  sessions=${day.sessions}  spend=${money(day.costUsd)}`, 360);
    }
    await out();

    const roi = getToolRoi({ projectPath, days: 7 });
    await out(`${CYAN}${BOLD}>>> get_tool_roi days=7${RESET}`, 650);
    const weakest = roi.tools[0];
    const strongest = roi.tools[roi.tools.length - 1];
    await out(`  weakest: ${RED}${BOLD}${weakest.name}${RESET} efficiency=${weakest.efficiency} cost_share=${money(weakest.estimatedCostShareUsd)}`, 800);
    await out(`  strongest: ${GREEN}${strongest.name}${RESET} efficiency=${strongest.efficiency}`, 700);
    await out();

    const anomalies = detectCostAnomalies({ projectPath, days: 7, recentTurnWindow: 6 });
    await out(`${CYAN}${BOLD}>>> detect_cost_anomalies days=7${RESET}`, 650);
    await out(`  baseline=${money(anomalies.baselineDailyCostUsd)}  anomalies=${YELLOW}${anomalies.anomalies.length}${RESET}`, 700);
    await out(`  runaway_detected=${RED}${BOLD}${String(anomalies.runaway_detected)}${RESET}`, 650);
    await out(`  reason=${YELLOW}${anomalies.runaway_reason_code ?? 'n/a'}${RESET}`, 900);
    await out();

    const estimate = estimateRunCost({
      model: 'claude-sonnet-4',
      prompt_tokens: 24_000,
      expected_output_tokens: 6_000,
      cached_input_tokens: 12_000,
      new_input_tokens: 12_000,
      budget_usd: 1,
    });
    await out(`${CYAN}${BOLD}>>> estimate_run_cost model=claude-sonnet-4 budget=$1${RESET}`, 650);
    await out(`  estimate=${BOLD}${money(estimate.estimateUsd)}${RESET}  within_budget=${GREEN}${String(estimate.withinBudget)}${RESET}`, 750);
    await out(`  pricing_model=${estimate.pricingModel}`, 650);
    await out();

    await out(`${GREEN}${BOLD}Operator readout:${RESET} Edit is the spend driver; trend confirms the spike; ROI/anomaly agree it should be stopped before another run.`, 1400);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
