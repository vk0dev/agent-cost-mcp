# AgentCost MCP — PRD

**Status: approved**
**Owner:** vk
**Date:** 2026-04-10
**Source:** Agent service scan v2 (2026-04-08), opportunity #4 (arbitrage, score 71)

## Problem Statement

Heavy Claude Code users spend $200-800/month on agent execution, but have **zero visibility** into where the tokens go. No breakdown by tool, by task, by session. 90%+ of tokens in heavy sessions are cache reads ($0.30/MTok) but users can't see this. 30-40% of context window often goes to tool schemas that are never used.

Built-in `/cost` shows session totals but no breakdown. Datadog/New Relic enterprise tools start at $100+/month — overkill for individual developers and small teams.

**This is an arbitrage opportunity:** the niche is empty, the demand is proven (every Claude Code user hits this), and the build is well-bounded (3-5 days).

## North Star

Every Claude Code user has lightweight, local cost visibility — knows where their tokens go, what to optimize, how their spending trends.

## Scope

### In Scope (v0.1)
- 4 MCP tools: `get_session_cost`, `get_tool_usage`, `get_cost_trend`, `suggest_optimizations`
- Local SQLite storage (no cloud)
- Hooks into Claude Code session data via the hooks API
- Cost calculation: model × tokens × pricing tier (input/output/cache reads)
- Tool usage tracking: which tools called, how many tokens, context share %
- Optimization suggestions: unused tools, expensive patterns
- MIT license, open source

### Out of Scope (v0.1)
- Cloud sync / multi-device
- Team aggregation (Pro tier later)
- Budget alerts (Pro tier later)
- Web dashboard (CLI/MCP only)
- Support for non-Claude Code agents (later)
- Real-time monitoring (data is per-session)

## Core User Flow

1. User installs `@vk0/agent-cost-mcp` and adds to `.mcp.json`
2. AgentCost reads Claude Code session logs from local filesystem
3. User asks agent: "what did my last task cost?"
4. Agent calls `get_session_cost` → structured breakdown
5. User asks: "which tools eat my context the most?"
6. Agent calls `get_tool_usage` → ranked list with context %
7. User asks: "how can I reduce costs?"
8. Agent calls `suggest_optimizations` → actionable list (e.g. "disable tool X — used 0 times in 10 sessions, consumes 15% context")

## Architecture

```
Tools:
  get_session_cost(sessionId?)
    → { totalTokens, costUSD, breakdown: { input, output, cacheReads }, model }

  get_tool_usage(sessionId?, days?)
    → { tools: [{ name, calls, avgTokens, totalTokens, contextSharePercent }] }

  get_cost_trend(days)
    → { daily: [{ date, costUSD, tokens, sessions }], totalUSD, avgPerDay }

  suggest_optimizations(sessionId?)
    → { suggestions: [{ action, reason, savings, impact: low|medium|high }] }

Internal:
  - Claude Code session log parser (JSONL files in ~/.claude/projects/*/...)
  - SQLite local cache for fast queries (~/.agent-cost-mcp/cache.db)
  - Pricing table (claude-opus, claude-sonnet, claude-haiku — auto-update from Anthropic docs)
  - Context analyzer: tool schema sizes, unused tool detection
```

## Competition

| Competitor | Why we win |
|---|---|
| Datadog MCP | Enterprise ($23/host/mo), overkill for individuals |
| New Relic Agentic | Enterprise pricing, complex setup |
| Langfuse | LLM observability, not agent cost optimization |
| Claude Code `/cost` | Built-in but no breakdown by tool/task |
| **Nothing else** | This is an empty niche — first-mover advantage |

## Success Metrics

- Build time: 3-5 days (arbitrage scope)
- Real cost calculation matches Claude Code `/cost` ±5%
- 4 tools all work in dogfood with real session data
- 3+ dogfood sessions on real Claude Code usage
- Published on NPM + Official MCP Registry
- Tool descriptions ≥80 chars each, no placeholders

## Risks

- **Hooks API access**: depends on Claude Code's exposed session data. Need to verify location of session logs early.
- **Pricing table maintenance**: Anthropic changes prices occasionally. Mitigate: keep table in JSON, easy to update.
- **Small TAM**: Only Claude Code users (but growing fast and they pay for agents).

## Why This Now

- ✅ Empty niche in MCP registries
- ✅ Proven demand ($6/day average user, $200-800/mo for heavy)
- ✅ Quick build (3-5 days for quality version)
- ✅ Clear revenue path (Pro tier: budget alerts, team aggregation, $5/mo)
- ✅ Tests OpenClaw autonomous workflow end-to-end
