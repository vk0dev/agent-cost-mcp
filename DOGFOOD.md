# Dogfood log

## Session 1
- Parsed the fixture-backed main session log and verified turn-level token aggregation.
- Confirmed tool-result linking stays stable when tool IDs are present in assistant content.

## Session 2
- Ran the parser with a subagent JSONL fixture and verified combined totals and source file tracking.
- Checked the summary shape for downstream MCP tool compatibility.

## Session 3
- Recomputed pricing using the config-driven pricing table for Sonnet and Opus examples.
- Verified build, lint, and Vitest pass before packaging checks.

## Session 4
- Command run: `npm run smoke`
- Smoke path: fixture-backed stdio run against `node dist/server.js` via an MCP client in `scripts/dogfood_smoke.mjs`.
- Tools discovered: `get_cost_trend`, `get_session_cost`, `get_tool_usage`, `suggest_optimizations`.
- Summarized outputs:
  - `get_session_cost` returned 2 turns, 2000 input tokens, 500 output tokens, and estimated cost `0.013718` USD.
  - `get_tool_usage` returned 2 tool names; first ranked tool was `Read` with 2 calls and `66.67%` context share.
  - `get_cost_trend` returned 2 sessions for one day with total cost `0.027443` USD.
  - `suggest_optimizations` returned 1 suggestion, focused on trimming the heaviest turn.
- Paths were kept fixture-local and summarized rather than copying full absolute output blobs into the log.
