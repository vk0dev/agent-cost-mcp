#!/usr/bin/env node
// Demo for the subagent-tree story — the killer differentiator vs ccusage.
// Runs against fixtures/session-subagent.jsonl (root) which includes
// demo-anomaly.jsonl as a child branch (the runaway-loop session).
//
// Recipe:
//   asciinema rec -c "node scripts/demo-subagent-tree.mjs" docs/demo-subagent-tree.cast --overwrite
//   ~/.local/bin/agg --speed 1.0 --theme monokai --font-size 16 \
//     docs/demo-subagent-tree.cast docs/demo-subagent-tree.gif

import { getSubagentTree } from "../dist/tools/index.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`${DIM}# An agent dispatched a subagent overnight. Both billed.${RESET}`);
  console.log(`${DIM}# Which branch burned the budget?${RESET}`);
  await sleep(2200);
  console.log();

  console.log(`${BOLD}$ npx -y @vk0/agent-cost-mcp@beta${RESET}`);
  await sleep(700);
  console.log(`${DIM}  parsing parent + subagent JSONLs...${RESET}`);
  await sleep(800);
  console.log();

  console.log(`${CYAN}${BOLD}>>> get_subagent_tree(session)${RESET}`);
  await sleep(700);

  const result = getSubagentTree({
    sessionPath: "fixtures/session-subagent.jsonl",
    subagentPaths: ["fixtures/session-main.jsonl", "fixtures/demo-anomaly.jsonl"],
  });

  const total = result.totalCostUsd;
  console.log(`  ${BOLD}total: $${total.toFixed(2)}${RESET}  across ${result.totalSessions} sessions`);
  console.log();
  await sleep(900);

  // Render the tree, branch by branch.
  function render(node, prefix, isLast, isRoot) {
    const cost = node.estimatedCostUsd;
    const share = (cost / total) * 100;
    const colour = share > 80 ? RED : share > 30 ? YELLOW : GREEN;
    const branch = isRoot ? "" : isLast ? "└── " : "├── ";
    const childPrefix = isRoot ? "" : isLast ? "    " : "│   ";
    const label = node.sessionId.padEnd(20);
    const cstr = `$${cost.toFixed(2)}`.padStart(7);
    const pct = `${share.toFixed(0)}%`.padStart(4);
    const line = `${prefix}${branch}${BOLD}${label}${RESET}  ${colour}${cstr}${RESET}  ${DIM}(${pct} of total)${RESET}`;
    console.log(line);
    const kids = node.children || [];
    for (let i = 0; i < kids.length; i++) {
      render(kids[i], prefix + childPrefix, i === kids.length - 1, false);
    }
  }
  render(result.tree, "  ", true, true);
  await sleep(2200);

  console.log();
  console.log(`${RED}${BOLD}  ⚠ demo-anomaly subagent ate 99% of the spend.${RESET}`);
  console.log(`${RED}${BOLD}    Without this view, you'd see only the rollup ($8.69) and${RESET}`);
  console.log(`${RED}${BOLD}    miss which child agent went sideways.${RESET}`);
  await sleep(2400);

  console.log();
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}ccusage gives you a flat table.${RESET}`);
  console.log(`${BOLD}${GREEN}agent-cost-mcp${RESET}${BOLD} gives you the tree, structured.${RESET}`);
  console.log(`${DIM}MCP-native output — your client can render this directly.${RESET}`);
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  await sleep(1800);
  console.log();
  console.log(`${DIM}npx -y @vk0/agent-cost-mcp@beta · v2.0.0-beta.6${RESET}`);
  await sleep(1500);
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exit(1);
});
