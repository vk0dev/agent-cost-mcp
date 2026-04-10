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

## Limitations

- Current implementation is fixture-backed and focused on Claude Code JSONL parsing
- Pricing is config-driven and approximate, not a billing-source-of-truth
- The MCP server and SQLite-backed history layer are planned for later phases

## Development

The current Phase 1.1 implementation validates parser behavior, tool-result linking, subagent aggregation, and pricing calculations with Vitest fixtures.
