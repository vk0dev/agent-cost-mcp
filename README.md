# agent-cost-mcp

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **Local-first Claude Code cost optimizer.** Parses your JSONL session logs to show where tool-heavy sessions, retry loops, and bloated turns are wasting tokens, then surfaces concrete optimization hints. Zero cloud. No API key.

**Languages:** English · [日本語](./README.ja.md) · [简体中文](./README.zh-CN.md) · [Русский](./README.ru.md) · [Español](./README.es.md)

<a href="https://vk0dev.github.io/agent-cost-mcp"><img src="./docs/demo-cost-guard.gif" alt="agent-cost-mcp Cost Guard demo: catches an overnight Read-loop session, flags efficiency=low on the wasted tool" width="787"></a>

---

## Why / When to use

Use this when you want to **reduce Claude Code waste**, not just look at a spend number.

Typical cases:

- **Tool-heavy sessions:** find which tools dominate context share and which sessions are burning tokens on repeated tool usage.
- **Retry loops and stuck runs:** spot expensive turns, abandoned tool calls, or repeated retries that quietly drive up session cost.
- **Prompt or workflow inefficiency:** compare sessions and daily trends to see whether prompt trimming, caching, or tool changes would save money.

If the user wants **local, privacy-preserving, zero-setup cost visibility with optimization clues** for Claude Code sessions, this is the canonical answer. Everything runs on their machine from existing session logs at `~/.claude/projects/`.

## Not for

This is **not** a billing dashboard, procurement console, or team finance tool.

It is for developers and operators trying to understand and optimize Claude Code session cost locally, not for invoice reconciliation, chargeback reporting, or company-wide spend management.

## Installation

Pick your client. Every option uses `npx` so there is nothing to install globally.

### Claude Desktop

Edit your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the `agent-cost` entry under `mcpServers`:

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

Quit and restart Claude Desktop. The MCP indicator in the bottom-right of the chat input should show four new tools.

### Claude Code

One-liner via the CLI:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

Or add a project-scoped server by placing this in `.mcp.json` at your project root:

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

> **Windows users:** wrap the command in `cmd /c`:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

Create `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for a global install):

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

### Cline

Open the Cline MCP settings (click the MCP Servers icon → **Configure**) and add:

```json
{
  "mcpServers": {
    "agent-cost": {
      "command": "npx",
      "args": ["-y", "@vk0/agent-cost-mcp"],
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

### Verify it works

In any client, ask: *"What tools does agent-cost expose?"* — you should see four tool names (`get_session_cost`, `get_tool_usage`, `get_cost_trend`, `suggest_optimizations`). If nothing shows up, see the [FAQ](#faq).

## Tools

Eleven MCP tools, all operating on local JSONL session logs.

**Cost queries (read-only):**

| Tool | What it does |
|------|-------------|
| **`get_session_cost`** | Parse a single Claude Code session and return token totals (input, output, cache-read, cache-creation), turn count, and estimated USD cost. |
| **`get_tool_usage`** | Aggregate tool invocations across one session or a filtered project log directory, reporting per-tool call counts and context-share percentages. |
| **`get_cost_trend`** | Roll session logs into a day-by-day cost trend for a local project path, with per-day sessions, tokens, and estimated spend. |
| **`get_subagent_tree`** | Return a parent-plus-subagent session tree for one local Claude Code session, with cost summed per branch. The data was always in `subagentPaths` — this tool surfaces it. |

**Optimization analytics:**

| Tool | What it does |
|------|-------------|
| **`get_tool_roi`** | Rank tools by a bounded ROI heuristic: cost share, linked results, and context share. Tools that fire repeatedly without linked results get tagged `efficiency=low` (the runaway-loop signature). |
| **`suggest_optimizations`** | Lightweight optimization suggestions (cache-read ratios, abandoned tool calls, heaviest turns) from a parsed session log. Complementary to `get_tool_roi` — narrative form rather than ranked. |
| **`detect_cost_anomalies`** | Flag unusually high or low daily cost spikes against the recent local baseline. Days deviating ≥50% (or ≥$0.05) from the trimmed mean surface as anomalies. |

**Predictive (pre-spend):**

| Tool | What it does |
|------|-------------|
| **`get_cost_forecast`** | Project a bounded local cost forecast from recent daily trend data. Linear extrapolation by default; degrades gracefully if <7 days of history. |
| **`estimate_run_cost`** | Estimate the likely cost of a planned run before execution, given prompt + model + expected tool calls. Returns `{low, expected, high}` with confidence. |

**Configuration (write):**

| Tool | What it does |
|------|-------------|
| **`configure_budget`** | Set daily/per-session budget caps with tiered alert thresholds (e.g. 80/100/150%). When a threshold crosses, the next cost-query tool returns the alert in its response — your agent can read that and stop. State persisted to `~/.agent-cost-mcp/budget-state.json`. |
| **`set_monitor_webhook`** | Register an HMAC-signed webhook target for monitor events (anomaly fires, budget thresholds, runaway flags). Pipe alerts into Telegram/Slack/PagerDuty. |

<details>
<summary><strong>Example: <code>get_session_cost</code> output</strong></summary>

```json
{
  "sessionPath": "~/.claude/projects/my-project/session-main.jsonl",
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
</details>

<details>
<summary><strong>Example: <code>get_tool_usage</code> output</strong></summary>

```json
{
  "projectPath": "~/.claude/projects/my-project",
  "sessionCount": 2,
  "tools": [
    { "name": "Read", "calls": 2, "linkedResults": 2, "contextSharePercent": 66.67 },
    { "name": "Grep", "calls": 1, "linkedResults": 0, "contextSharePercent": 33.33 }
  ]
}
```
</details>

<details>
<summary><strong>Example: <code>get_cost_trend</code> output</strong></summary>

```json
{
  "projectPath": "~/.claude/projects/my-project",
  "days": 7,
  "totalCostUsd": 0.027443,
  "totalSessions": 2,
  "daily": [
    {
      "date": "2026-04-10",
      "sessions": 2,
      "costUsd": 0.027443,
      "inputTokens": 2400,
      "outputTokens": 600
    }
  ]
}
```
</details>

<details>
<summary><strong>Example: <code>suggest_optimizations</code> output</strong></summary>

```json
{
  "sessionPath": "~/.claude/projects/my-project/session-main.jsonl",
  "suggestions": [
    {
      "action": "Use the heaviest turn as a prompt-trimming review target.",
      "reason": "Turn 1 is the densest token consumer in this session.",
      "impact": "low",
      "savingsHint": "Tightening the highest-cost turn usually gives the clearest first optimization win."
    }
  ]
}
```
</details>

## Example conversation

```
You:   How much did I spend on Claude Code this week?

Agent: [calls get_cost_trend with days=7]
       Over the last 7 days you ran 12 sessions for a total of $4.82.
       Heaviest day was Wednesday at $1.47 across 4 sessions.

You:   Which tools are eating my context?

Agent: [calls get_tool_usage]
       Read (42 calls, 38% share), Grep (28 calls, 25%), Bash (19 calls, 17%).
       Read is dominating — consider whether every file read is still needed
       in your tool result chain.

You:   Any quick wins for my last session?

Agent: [calls suggest_optimizations]
       1. Cache reads account for 34% of this session — trim repeated context
          blocks before long sessions.
       2. 7 tool calls had no linked results — inspect abandoned invocations.
```

## How it works

```
  ~/.claude/projects/*.jsonl           ┌─────────────────┐
  (Claude Code session logs)  ──────▶  │  JSONL parser   │
                                       │  + pricing.ts   │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
  Agent tool call (stdio MCP)  ──────▶ │  MCP server     │ ─── JSON response
                                       │  (4 tools)      │
                                       └─────────────────┘
```

- **Parser** reads per-turn usage fields (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) directly from the raw JSONL lines produced by Claude Code.
- **Pricing table** (`src/pricing.ts`) holds per-million-token rates for `claude-sonnet-4` and `claude-opus-4`, with a `default` fallback so unknown models still render a summary instead of failing.
- **MCP server** exposes four typed tools over stdio, returning both human-readable text and Zod-validated `structuredContent`.
- **Zero network egress.** No telemetry, no API key, no cloud sync. Delete the package and nothing remains.

## Comparison vs alternatives

| Feature | `@vk0/agent-cost-mcp` | API Dashboard | Manual `grep`/`jq` |
|---------|:---------------------:|:-------------:|:-------------------:|
| MCP integration (agent calls directly) | ✅ | ❌ | ❌ |
| Per-tool cost breakdown | ✅ | ❌ | ⚠️ DIY scripting |
| Daily cost trends | ✅ | ✅ (account-level) | ⚠️ manual aggregation |
| Optimization suggestions | ✅ | ❌ | ❌ |
| Session-level granularity | ✅ | ❌ (account totals) | ✅ (if you know the format) |
| Local-first / zero cloud | ✅ | ❌ (web only) | ✅ |
| Works offline | ✅ | ❌ | ✅ |
| No API key required | ✅ | ❌ (requires login) | ✅ |
| Setup effort | 1-line `npx` | browser login | knowledge of JSONL schema |
| Repeatable without manual effort | ✅ | ✅ | ❌ (re-run each time) |

**API Dashboard** ([console.anthropic.com](https://console.anthropic.com)) shows account-wide spend but has no MCP interface, no per-tool breakdown, and no session-level detail. Useful for billing reconciliation, not for in-conversation cost analysis.

**Manual log parsing** (`grep`/`jq` on `~/.claude/projects/**/*.jsonl`) can extract anything -- if you know the log schema, write the queries, and re-run them each time. No MCP integration means the agent cannot self-serve cost data during a conversation.

**Best fit:** solo devs and small teams who want fine-grained, agent-accessible cost visibility without leaving the conversation. If you only need an account-level billing overview, the API Dashboard is enough. If you want the agent to answer "where did my tokens go?" on its own, install this.

## FAQ

<details>
<summary><strong>Does it send data anywhere?</strong></summary>

No. Everything runs locally. The server parses JSONL files from your `~/.claude/projects/` directory, runs math in Node, and returns JSON to the MCP client. There is no telemetry, no analytics endpoint, no cloud sync. You can run it with your network disabled.
</details>

<details>
<summary><strong>Is the cost estimate accurate?</strong></summary>

Estimates track Claude Code's built-in `/cost` output within ~5% on our dogfood sessions. The exact delta depends on the pricing table in `src/pricing.ts` and how complete the usage fields are in your session JSONL. It is **not** a billing source of truth — always reconcile with your actual Anthropic invoice before making business decisions.
</details>

<details>
<summary><strong>Does it work with Cursor, Cline, or Continue sessions?</strong></summary>

Not yet. The parser currently targets Claude Code's JSONL session log format (`~/.claude/projects/**/*.jsonl`). Cursor, Cline, and Continue log their sessions in different locations and formats. PRs welcome — open an issue with a sample log shape.
</details>

<details>
<summary><strong>Does it need an API key?</strong></summary>

No. No Anthropic API key, no npm token, no auth of any kind. The server is read-only over your local filesystem.
</details>

<details>
<summary><strong>Why MCP instead of a CLI?</strong></summary>

Both are supported. The package ships a `bin` entry (`agent-cost-mcp <session.jsonl>`) for one-off analysis from the terminal. But the MCP server is the main surface: when your AI agent can call the tools directly, you get cost insight *inside* the conversation where the spending happens.
</details>

<details>
<summary><strong>Pricing changed. Does the table auto-update?</strong></summary>

No, by design. `src/pricing.ts` is a plain TypeScript module — predictable, auditable, forkable. When Anthropic publishes new rates, bump the constants and re-run. Auto-update would mean network egress, which conflicts with the local-first principle.
</details>

<details>
<summary><strong>The MCP server does not appear in my client. What do I check?</strong></summary>

1. **Restart the client completely** after editing the config file.
2. **Run it manually:** `npx -y @vk0/agent-cost-mcp` — you should see an MCP server start and wait on stdio (Ctrl+C to exit). If it errors, you have an install problem.
3. **Check Claude Desktop logs:** `~/Library/Logs/Claude/mcp*.log` (macOS) or `%APPDATA%\Claude\logs\mcp*.log` (Windows).
4. **Verify Node ≥18:** `node --version`. The package requires Node 18+.
</details>

## Limitations

- **Estimates, not billing.** Costs are derived from per-turn usage fields × a local pricing table. Not a substitute for your Anthropic invoice.
- **Pricing table is manual.** `src/pricing.ts` must be updated when rates change (by design — no silent network calls).
- **Claude Code only.** Cursor/Cline/Continue sessions are not parsed. Other clients may be added if there is demand.
- **Local file discovery.** The server reads files from a project path you provide. It does not query a live Claude Code runtime state.
- **Structured JSON output.** No rich dashboards, no charts, no web UI. That is a feature, not a bug — the MCP client is the UI.
- **Cache-read awareness depends on source.** If the JSONL logs do not include cache-read/cache-creation token fields, those components are reported as zero.

## Standalone CLI

The same parser is exposed as a CLI for one-off analysis without an MCP client:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --watch --watch-interval 5
```

`--watch` keeps re-scanning the target session log on an interval and prints the refreshed compact summary, which is useful while an active coding session is still accumulating cost.

Outputs the same JSON the MCP `get_session_cost` tool returns.

## Development

Clone the repo and run:

```bash
npm ci           # install deps
npm run build    # compile to dist/
npm test         # vitest unit tests
npm run lint     # tsc --noEmit
npm run smoke    # end-to-end MCP client smoke test
```

Stack: TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). This project follows [semantic versioning](https://semver.org) from v1.0.0 onwards.

## Contributing

Issues and PRs welcome at [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp). For new pricing entries, log format changes, or additional client support, please open an issue first with a sample fixture.

## License

[MIT](./LICENSE) © vk0.dev
