# agent-cost-mcp

Lightweight local cost tracking for Claude Code sessions.

This package parses Claude Code JSONL session logs, aggregates token usage across main and subagent sessions, estimates spend from a local pricing table, and now exposes four MCP tools for cost review and optimization workflows.

## Installation

```bash
npm install
npm test
npm run build
npm run lint
```

## Quickstart: run the MCP server over stdio

Build first, then start the server with Node so an MCP client can connect over stdio:

```bash
npm run build
node dist/server.js
```

## Tools

The MCP server exposes four tools:

- `get_session_cost`
- `get_tool_usage`
- `get_cost_trend`
- `suggest_optimizations`

### `get_session_cost`

Use this when you want one parsed session summary with token totals and estimated USD cost.

Example input:

```json
{
  "sessionId": "session-main",
  "projectPath": "./fixtures"
}
```

Example output:

```json
{
  "sessionPath": "/abs/path/fixtures/session-main.jsonl",
  "subagentPaths": [],
  "turnCount": 2,
  "totals": {
    "input_tokens": 2000,
    "output_tokens": 500,
    "cache_read_input_tokens": 100,
    "cache_creation_input_tokens": 50,
    "tool_use_count": 1,
    "tool_result_count": 1,
    "linked_tool_result_count": 1,
    "estimated_cost_usd": 0.013718
  }
}
```

### `get_tool_usage`

Use this when you want to see which tools appear most often across one session or a local project log folder.

Example input:

```json
{
  "projectPath": "./fixtures",
  "days": 7
}
```

Example output:

```json
{
  "projectPath": "/abs/path/fixtures",
  "sessionCount": 2,
  "tools": [
    {
      "name": "unknown",
      "calls": 3,
      "linkedResults": 2,
      "contextSharePercent": 100
    }
  ]
}
```

### `get_cost_trend`

Use this when you want a day-by-day rollup of local session costs.

Example input:

```json
{
  "days": 7,
  "projectPath": "./fixtures"
}
```

Example output:

```json
{
  "projectPath": "/abs/path/fixtures",
  "days": 7,
  "totalCostUsd": 0.052593,
  "totalSessions": 2,
  "daily": [
    {
      "date": "2026-04-10",
      "sessions": 2,
      "costUsd": 0.052593,
      "inputTokens": 2400,
      "outputTokens": 600
    }
  ]
}
```

### `suggest_optimizations`

Use this when you want lightweight follow-up suggestions after reviewing one session.

Example input:

```json
{
  "sessionId": "session-main",
  "projectPath": "./fixtures"
}
```

Example output:

```json
{
  "sessionPath": "/abs/path/fixtures/session-main.jsonl",
  "suggestions": [
    {
      "action": "Trim repeated context blocks before long sessions.",
      "reason": "Cache reads account for 3.5% of observed tokens in this session.",
      "impact": "medium",
      "savingsHint": "Review prompts and tool schemas that are repeatedly re-sent but rarely changed."
    }
  ]
}
```

## Cost estimation method

Cost estimates are derived from per-turn token usage recorded in Claude Code JSONL session logs and multiplied by a pricing table in `src/pricing.ts`.

- Input tokens use the model `inputPerMillion` rate.
- Output tokens use the model `outputPerMillion` rate.
- Cache reads use the discounted `cacheReadPerMillion` rate when defined.
- Cache creation tokens use `cacheCreationPerMillion` when defined.
- Unknown models fall back to the `default` pricing entry so summaries still render instead of failing.

This keeps the parser deterministic and local-first, but it also means estimates are only as accurate as the captured usage fields and the maintained pricing table.

## Limitations

- Costs are approximate and are not a billing-source-of-truth.
- The pricing table is static in code until you update `src/pricing.ts`.
- Cache read and cache creation token treatment depends on those fields being present in the source JSONL logs.
- Current session discovery is local-file based and does not query live Claude Code state.
- The MCP server focuses on structured JSON summaries, not rich dashboards or cloud sync.

## CLI smoke test

```bash
npm run build
node dist/cli.js fixtures/session-main.jsonl
node dist/cli.js fixtures/session-main.jsonl --subagent fixtures/session-subagent.jsonl
```

## Development

The current implementation validates parser behavior, pricing calculations, CLI packaging, MCP tool registration, and fixture-backed tool outputs with Vitest.
