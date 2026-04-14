# agent-cost-mcp v1.0.0

**Local-first Claude Code cost analyzer.** Zero cloud. No API key.

## Highlights

- **4 MCP tools** for cost visibility: `get_session_cost`, `get_tool_usage`, `get_cost_trend`, `suggest_optimizations`
- **1-line install** via `npx` — works with Claude Desktop, Claude Code, Cursor, and Cline
- **Local-first by design** — parses JSONL session logs from `~/.claude/projects/`, zero network egress
- **Per-tool breakdown** — see which tools eat your context window
- **Daily cost trends** — watch spend move over time
- **Optimization hints** — cache-read ratios, abandoned tool calls, heaviest turns
- **Config-driven pricing** — editable TypeScript pricing table for `claude-sonnet-4` and `claude-opus-4`

## Quick start

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

Then ask: *"How much did my last session cost?"*

## Install guides

See [README](https://github.com/vk0dev/agent-cost-mcp#install) for Claude Desktop, Claude Code, Cursor, and Cline snippets.

## Links

- [npm package](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
- [Landing page](https://vk0dev.github.io/agent-cost-mcp)
- [CHANGELOG](https://github.com/vk0dev/agent-cost-mcp/blob/main/CHANGELOG.md)
- README in: [English](https://github.com/vk0dev/agent-cost-mcp/blob/main/README.md) · [日本語](https://github.com/vk0dev/agent-cost-mcp/blob/main/README.ja.md) · [简体中文](https://github.com/vk0dev/agent-cost-mcp/blob/main/README.zh-CN.md) · [Русский](https://github.com/vk0dev/agent-cost-mcp/blob/main/README.ru.md) · [Español](https://github.com/vk0dev/agent-cost-mcp/blob/main/README.es.md)
