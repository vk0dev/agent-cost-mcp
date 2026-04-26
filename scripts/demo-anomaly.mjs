#!/usr/bin/env node
// Demo for the v2.0 Cost Guard launch.
// Runs against fixtures/demo-anomaly.jsonl: a synthetic overnight session
// where an agent fell into a Read-loop and burned ~$8.66 in tokens.
//
// Recorded via:
//   asciinema rec -c "node scripts/demo-anomaly.mjs" docs/demo-cost-guard.cast
// And rendered to GIF with `agg`:
//   agg --speed 1.0 --theme monokai docs/demo-cost-guard.cast docs/demo-cost-guard.gif

import {
  getSessionCost,
  getToolRoi,
  detectCostAnomalies,
} from "../dist/tools/index.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const projectPath = "fixtures/demo-anomaly.jsonl";

async function main() {
  console.log(`${DIM}# Story: an agent ran a Read-loop overnight.${RESET}`);
  console.log(`${DIM}# 14 turns. Did anyone notice?${RESET}`);
  await sleep(2200);
  console.log();

  console.log(`${BOLD}$ npx -y @vk0/agent-cost-mcp@^2 ./session.jsonl${RESET}`);
  await sleep(900);
  console.log(`${DIM}  parsing session log...${RESET}`);
  await sleep(800);
  console.log();

  console.log(`${CYAN}${BOLD}>>> get_session_cost(session)${RESET}`);
  await sleep(700);
  const cost = getSessionCost({ projectPath });
  const totalUsd = cost.totals.estimated_cost_usd;
  console.log(`  turns: ${BOLD}${cost.turnCount}${RESET}`);
  console.log(`  total cost: ${RED}${BOLD}$${totalUsd.toFixed(2)}${RESET}  ${DIM}(in one session)${RESET}`);
  console.log(`  cache reads: ${YELLOW}${cost.totals.cache_read_input_tokens.toLocaleString()} tokens${RESET}  ${DIM}— that's where the burn went${RESET}`);
  await sleep(2000);

  console.log();
  console.log(`${CYAN}${BOLD}>>> get_tool_roi(session)${RESET}`);
  await sleep(700);
  const roi = getToolRoi({ projectPath, days: 1 });
  console.log(`  ${roi.tools.length} tools used. Per-tool ROI:`);
  await sleep(700);

  for (const t of roi.tools) {
    const colour = t.efficiency === "low" ? RED : t.efficiency === "high" ? GREEN : YELLOW;
    const tag = t.efficiency.padEnd(6);
    console.log(
      `  ${colour}● ${t.name.padEnd(6)}${RESET}` +
      `  calls=${BOLD}${String(t.calls).padStart(2)}${RESET}` +
      `  cost=$${t.estimatedCostShareUsd.toFixed(2).padStart(5)}` +
      `  linked=${String(t.linkedResults).padStart(2)}` +
      `  ${colour}${tag}${RESET}`
    );
  }
  await sleep(2000);

  console.log();
  console.log(`${RED}${BOLD}  ⚠ Edit: 4 calls, 0 linked results — agent fired tools, ignored output.${RESET}`);
  console.log(`${RED}${BOLD}  ⚠ That's a runaway-loop signature. Cost Guard catches it locally,${RESET}`);
  console.log(`${RED}${BOLD}    no dashboard, no telemetry, no API key.${RESET}`);
  await sleep(2400);

  // Check for runaway flag too
  const anomaly = detectCostAnomalies({ projectPath, days: 7 });
  if (anomaly.runaway_detected) {
    console.log();
    console.log(`${RED}${BOLD}  ⚠ runaway_detected: true${RESET}  ${DIM}(MCP webhook would fire here)${RESET}`);
    await sleep(1400);
  }

  console.log();
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}ccusage tells you what you spent.${RESET}`);
  console.log(`${BOLD}${GREEN}agent-cost-mcp${RESET}${BOLD} stops you from spending it.${RESET}`);
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  await sleep(1800);
  console.log();
  console.log(`${DIM}npm install -g @vk0/agent-cost-mcp · v2.0.0-beta.4${RESET}`);
  await sleep(1500);
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exit(1);
});
