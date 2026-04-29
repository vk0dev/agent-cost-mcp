# 5-minute setup with Claude Desktop

This guide gets `@vk0/agent-cost-mcp` running in Claude Desktop and gives you one useful first prompt to confirm it is working.

## Before you start

You need:

- Claude Desktop
- Node.js 18 or newer
- Claude Code session logs on this machine, usually under `~/.claude/projects/`

Check Node once:

```bash
node --version
```

If it prints `v18` or newer, you are good.

## 1. Open the Claude Desktop config file

Edit this file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

If the file does not exist yet, create it.

## 2. Add the MCP server entry

Put this under `mcpServers`:

```json
{
  "mcpServers": {
    "agent-cost": {
      "command": "npx",
      "args": ["-y", "@vk0/agent-cost-mcp"]
    }
  }
}
```

If you already have other MCP servers, keep them and add `agent-cost` alongside them.

## 3. Restart Claude Desktop completely

Quit Claude Desktop, then open it again. A full restart matters because Claude only loads MCP servers on startup.

## 4. Confirm the server loaded

In a new Claude Desktop chat, ask:

```text
What tools does the agent-cost MCP server expose?
```

You should see these eleven tools:

- `get_session_cost`
- `get_tool_usage`
- `get_cost_trend`
- `get_subagent_tree`
- `get_tool_roi`
- `suggest_optimizations`
- `detect_cost_anomalies`
- `get_cost_forecast`
- `estimate_run_cost`
- `configure_budget`
- `set_monitor_webhook`

If you do not, skip to [Troubleshooting](#troubleshooting).

## 5. Run one useful first command

Ask Claude:

```text
Use get_cost_trend for the last 7 days on ~/.claude/projects and tell me which day was most expensive.
```

Why this is a good first check:

- it confirms Claude can call the MCP tool
- it confirms the server can read your local Claude Code logs
- it gives you a practical answer immediately instead of a generic health check

## 6. Good next prompts

Once the basic check works, these are the fastest useful follow-ups:

```text
Use get_tool_usage on ~/.claude/projects and show me the top 5 tools by call count.
```

```text
Use suggest_optimizations on my latest session and summarize the concrete waste signals.
```

```text
Use get_subagent_tree on my latest session and tell me whether the parent or a child agent drove most of the spend.
```

## Troubleshooting

### Claude Desktop shows no new tools

Check these in order:

1. Restart Claude Desktop fully, not just the current chat.
2. Run the package manually:

```bash
npx -y @vk0/agent-cost-mcp
```

It should start and wait on stdio. If it errors, fix that first.

3. Confirm Node is new enough:

```bash
node --version
```

4. Check Claude Desktop MCP logs:
   - macOS: `~/Library/Logs/Claude/mcp*.log`
   - Windows: `%APPDATA%\Claude\logs\mcp*.log`

### The tools load, but results are empty or fail

The server reads local Claude Code JSONL logs. If you have never used Claude Code on this machine, or your logs live somewhere unusual, cost tools will not have data to parse yet.

Start with a path you know exists, for example:

```text
Use get_cost_trend on projectPath ~/.claude/projects for the last 7 days.
```

## What this setup does not do

- It does not send your session logs to a cloud service.
- It does not read live billing data from Anthropic.
- It does not auto-enforce spending limits outside the MCP responses.

It only parses local JSONL logs and returns structured results to your MCP client.
