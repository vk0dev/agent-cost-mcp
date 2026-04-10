# agent-cost-mcp

Lightweight local cost tracking for Claude Code sessions.

This package parses Claude Code JSONL session logs, aggregates token usage across main and subagent sessions, and estimates spend using a config-driven pricing table. The current Phase 1.1 slice focuses on the session-log parser and pricing primitives that later MCP tools will build on.

## Installation

```bash
npm install
npm test
npm run build
npm run lint
```

## Tools

Phase 1.1 exposes parser and pricing primitives that support the planned MCP tool surface:

- `get_session_cost` for total session cost and token breakdowns
- `get_tool_usage` for per-tool usage and context share summaries
- `get_cost_trend` for historical cost rollups across sessions
- `suggest_optimizations` for actionable cost-saving guidance

## Cost estimation method

Cost estimates are derived from per-turn token usage recorded in Claude Code JSONL session logs and multiplied by a pricing table in `src/pricing.ts`.

- Input tokens use the model `inputPerMillion` rate
- Output tokens use the model `outputPerMillion` rate
- Cache reads use the discounted `cacheReadPerMillion` rate when defined
- Cache creation tokens use `cacheCreationPerMillion` when defined
- Unknown models fall back to the `default` pricing entry so summaries still render instead of failing

This keeps the parser deterministic and local-first, but it also means estimates are only as accurate as the captured usage fields and the maintained pricing table. They are useful for relative cost visibility and regression tracking, not as a billing-source-of-truth.

## Limitations

- Current implementation is fixture-backed and focused on Claude Code JSONL parsing
- Pricing is config-driven and approximate, not a billing-source-of-truth
- The MCP server and SQLite-backed history layer are planned for later phases

## Development

The current Phase 1.1 implementation validates parser behavior, tool-result linking, subagent aggregation, and pricing calculations with Vitest fixtures.
