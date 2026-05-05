# agent-cost-mcp

面向 Claude Code 中 AI agent 的本地 Cost Guard 与 runtime guardrails。

当前 v2.3.0 的发布表面保持 local-first，并且聚焦一个 operator-facing 的核心工作：弄清成本到底来自哪里、接下来会往哪里走、如何按 provider/model/tool 做 attribution、如何通过 `subtreeCost` 汇总 subagent tree，以及如何在不引入 hosted control plane 的前提下推送 signed monitor-webhook alerts。

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **给 Claude Code 用的 Cost Guard。** `@vk0/agent-cost-mcp` 会读取你的本地 JSONL 会话日志，回答 `/cost` 之后真正的问题：到底是哪一个 tool、branch、retry loop 或 runaway pattern 在烧 token，接下来该改什么。零云端。无需 API key。

**语言:** [English](./README.md) · [日本語](./README.ja.md) · 简体中文 · [Русский](./README.ru.md) · [Español](./README.es.md)

> Listing status：npm 目前是 canonical install path，Smithery 与 mcp.so 也已经验证为 live，但这个 README 现在还不会把 Glama 当成 verified listing。

<a href="https://vk0dev.github.io/agent-cost-mcp"><img src="./docs/demo-cost-guard.gif" alt="agent-cost-mcp Cost Guard demo: anomaly trigger fires, low-ROI retry loop is flagged, and the agent stops at the hard budget cap" width="787"></a>

---

## 为什么用 / 什么时候用

当 **Claude Code 已经给了你一个成本数字，但没有解释原因** 时，就该用它。

典型的 Cost Guard 场景包括：

- **tool-heavy 会话：** 找出哪些工具在一次 run 或多次 run 中占据了 cost share、context share，以及 low-ROI call patterns。
- **retry loops 与 runaway behavior：** 在 repeated turns、abandoned tool calls、anomaly days 或 branch-level burn patterns 悄悄累积前就把它们抓出来。
- **pre-spend guardrails：** 预估下一次 run 的成本、设置 budget thresholds、配置 monitor alerts，避免长时间 agent run 悄悄超支。

如果用户想要的是 **本地、保护隐私、零额外搭建的 cost forensics 加 guardrails**，并且对象是 Claude Code 会话，这就是 canonical answer。所有计算都基于机器上已有的 `~/.claude/projects/` 日志完成。

**Claude Code 会话日志位置：** 查看 `~/.claude/projects/<project>/` 下的每个 `.jsonl` 会话文件，例如 `~/.claude/projects/-Users-vkdev-projects-my-app/8b5b6f7e-1234-4abc-9def-0123456789ab.jsonl`。如果客户端已经知道精确的 session path，就直接传那个路径；如果还不知道，就先把对应的 project folder 传给 Agent Cost MCP，再检查里面最近的 JSONL 文件。

## 不适合做什么

它 **不是** billing dashboard、procurement console、org-finance system，也不是 invoice source of truth。

它服务的是想从本地 Claude Code 日志里得到 Cost Guard 式答案的开发者和 operator，而不是 chargeback reporting、company-wide spend accounting 或 live runtime introspection。

## 安装

选择你的客户端。所有方式都通过 `npx` 运行，不需要全局安装。

### Claude Desktop

编辑 Claude Desktop 配置文件：

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

在 `mcpServers` 下添加 `agent-cost`：

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

完全退出并重启 Claude Desktop。聊天输入框右下角的 MCP 指示器应该能显示 11 个新工具。

### Claude Code

CLI 一行命令：

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

或者在项目根目录的 `.mcp.json` 中添加项目级 server：

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

> **Windows 用户：** 请用 `cmd /c` 包裹命令：
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

在项目根目录创建 `.cursor/mcp.json`，如果要全局安装则用 `~/.cursor/mcp.json`：

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

打开 Cline 的 MCP 设置，点击 MCP Servers 图标 → **Configure**，加入：

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

### 验证是否生效

在任意客户端里问一句：*“agent-cost 暴露了哪些工具？”* 你应该看到大致分成下面几组的 11 个工具：

- cost queries: `get_session_cost`, `get_tool_usage`, `get_cost_trend`, `get_subagent_tree`
- optimization analytics: `get_tool_roi`, `suggest_optimizations`, `detect_cost_anomalies`
- predictive: `get_cost_forecast`, `estimate_run_cost`
- configuration: `configure_budget`, `set_monitor_webhook`

如果没有出现，请查看 [FAQ](#faq)。

## Marketplace / Discovery

当前已验证的 discovery surfaces：

- **npm:** 规范安装路径为 `npx -y @vk0/agent-cost-mcp`
- **MCP Registry:** package metadata 与 registry-facing identity
- **Smithery:** 已验证的第三方 listing `https://smithery.ai/servers/unfucker/agent-cost-mcp`
- **mcp.so:** 已验证的产品页 `https://mcp.so/server/agent-cost-mcp/vk0dev`

Glama 目前应视为未验证，直到它稳定的 product-page URL 再次被确认。

不同 discovery surface 上的 metadata 质量可能不同，但就这个 package 来说，Smithery 和 mcp.so 目前都已经有 verified live presence。

如果你是第一次发现这个 package，今天推荐的路径是：用 npm 安装，然后用 Smithery 或 mcp.so 做 marketplace-style browsing。

## Claude Code 内建 `/cost` vs `@vk0/agent-cost-mcp`

Claude Code 本身已经提供了有用的基础成本可视化。`@vk0/agent-cost-mcp` 解决的是下一层分析问题。

### 什么时候用内建 `/cost`

- 你只想快速看一下当前会话
- 你只需要 native statusline 或 local session spend visibility
- 你在 active run 期间检查 budget flags

### 什么时候用 `@vk0/agent-cost-mcp`

- 你要通过 `get_tool_usage` 做 per-tool analysis
- 你需要通过 `get_subagent_tree` 做 parent/subagent attribution
- 你想要通过 `get_cost_forecast` 做 local forward-looking estimates
- 你需要通过 `configure_budget` 给 agent-readable guardrails
- 你需要通过 webhook notifications 把 alerts 路由出去

### 最佳方式是一起用

用 Claude Code built-ins 做会话中的 quick visibility，当下一个问题变成 *到底是哪一个 tool 造成的、哪个 branch 烧掉了预算、成本随时间怎么变、agent 接下来该做什么* 时，再交给 `@vk0/agent-cost-mcp`。

这个 package **不会** 取代 invoices、org-wide billing systems 或 live runtime introspection。它是一个面向 Claude Code 会话日志的本地 MCP surface，用来做 structured cost analysis。

## 文档与 how-to guides

如果你不想先读完整 reference，而是想直接进入具体 operator workflows，请先看这里：

- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

## 工具

共有 11 个 MCP 工具，它们都操作本地 JSONL 会话日志，并围绕同一个 Cost Guard 问题工作：成本在什么地方累积、当前模式有多危险、operator 或 agent 下一步该改什么。

**Cost queries (read-only)：**

| Tool | 作用 |
|------|-------------|
| **`get_session_cost`** | 解析单个 Claude Code 会话并返回 token totals、turn count、cache usage 与 estimated USD cost，让后续所有 Cost Guard 问题都建立在一份具体 run summary 上。 |
| **`get_tool_usage`** | 聚合单个会话或筛选后的项目日志目录中的 tool invocations，报告 per-tool call counts 与 context-share percentages，帮助你看清哪些 tool patterns 真正在推动 spend。 |
| **`get_cost_trend`** | 把会话日志汇总为逐日的 local cost trend，带上 per-day sessions、tokens 与 estimated spend，让 anomalies 和 burn 上升在变成猜测前就可见。 |
| **`get_subagent_tree`** | 返回一次本地 Claude Code run 的 parent-plus-subagent tree，并按 branch 汇总 cost，让你看到到底是哪条 branch 或 delegated path 消耗了预算。 |

![subagent tree demo](docs/demo-subagent-tree.gif)

**Optimization analytics：**

| Tool | 作用 |
|------|-------------|
| **`get_tool_roi`** | 使用基于 cost share、linked results、context share 的 bounded ROI heuristic 给 tools 排序，让 low-efficiency 或 runaway-loop 的典型模式尽快暴露。 |
| **`suggest_optimizations`** | 从已解析的 session log 中生成轻量优化建议，包括 cache-read ratios、abandoned tool calls 和 heaviest turns，当你需要的是下一步具体修正而不是一张原始指标表。 |
| **`detect_cost_anomalies`** | 对照最近的 local baseline 标记 unusually high 或 low 的 daily cost spikes，让 sudden burn jumps、suspicious drops 与 unstable usage patterns 无需单独 monitoring stack 也能被看见。 |

**Predictive (pre-spend)：**

| Tool | 作用 |
|------|-------------|
| **`get_cost_forecast`** | 根据最近的 daily trend data 生成 bounded 的 local cost forecast，让 operator 不只知道成本已经花到哪里，还能知道接下来大概会走向哪里。历史较短时也会 gracefully 降级。 |

![forecast demo: get_cost_forecast showing recency-weighted-average-rc2 local spend projection](docs/demo-forecast.gif)

![forecast fallback demo: sparse-history fallback lowers spike-driven overprojection and adds confidence metadata](docs/demo-forecast-fallback.gif)
| **`estimate_run_cost`** | 根据 prompt、model 与预期的 tool-call shape，在执行前预估 planned run 的成本，返回带 confidence 的 `{low, expected, high}` 供 pre-spend 决策使用。 |

**Configuration (write)：**

| Tool | 作用 |
|------|-------------|
| **`configure_budget`** | 设置 daily 或 per-session 的 budget caps 与 tiered alert thresholds，让下一个 cost-query tool 能在 agent 默默越过 soft 或 hard spending boundary 之前返回 machine-readable warning。 |

![budget cap demo](docs/demo-budget-cap.gif)
| **`set_monitor_webhook`** | 注册一个 HMAC-signed webhook target，用于 anomaly alerts、budget threshold crossings 与 runaway flags，让 Cost Guard signals 在需要时从本地会话流向 operator workflow。 |

<details>
<summary><strong><code>get_session_cost</code> 输出示例</strong></summary>

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
<summary><strong><code>get_tool_usage</code> 输出示例</strong></summary>

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
<summary><strong><code>get_cost_trend</code> 输出示例</strong></summary>

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
<summary><strong><code>suggest_optimizations</code> 输出示例</strong></summary>

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

## 对话示例

```
你:     我这周在 Claude Code 上花了多少?

Agent:  [调用 get_cost_trend，days=7]
        最近 7 天你运行了 12 次会话，总计 $4.82。
        最贵的一天是周三，4 次会话合计 $1.47。

你:     哪些工具在吃我的上下文?

Agent:  [调用 get_tool_usage]
        Read（42 次调用，38% 占比）、Grep（28 次，25%）、Bash（19 次，17%）。
        Read 明显占主导，值得检查这些文件读取是否仍然都必要。

你:     我上一次会话有什么 quick wins 吗?

Agent:  [调用 suggest_optimizations]
        1. Cache reads 占这次会话的 34%，可以先裁掉长会话前反复出现的
           context blocks。
        2. 有 7 次 tool calls 没有 linked results，建议检查这些 abandoned invocations。
```

## 工作原理

```
  ~/.claude/projects/*.jsonl           ┌─────────────────┐
  (Claude Code session logs)  ──────▶  │  JSONL parser   │
                                       │  + pricing.ts   │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌──────────────────────────┐
  Agent tool call (stdio MCP)  ──────▶ │  MCP server              │ ─── JSON response
                                       │  (11 tools across query, │
                                       │   analytics, forecast,   │
                                       │   and config surfaces)   │
                                       └──────────────────────────┘
```

- **Parser** 直接从 Claude Code 生成的 raw JSONL lines 读取 per-turn usage fields（`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`）。
- **Pricing table**（`src/pricing.ts`）保存 Claude models 的 per-million-token rates，并带有 `default` fallback，这样未知模型也能返回 summary 而不是失败。
- **MCP server** 通过 stdio 暴露 11 个 typed tools，覆盖 local cost queries、per-tool/session analytics、anomaly detection、pre-run forecasting、budget caps 与 webhook alert configuration。
- **默认没有 network egress。** 没有 telemetry、没有 API key、没有 cloud sync。唯一可选的 outbound surface 是 `set_monitor_webhook`，它是一个用于 alert delivery 的明确 opt-in 配置。

## 与替代方案对比

这些工具有交集，但它们针对的问题不同。简短地说，如果你想要一个 agent 可以直接调用、用于 session forensics、per-tool attribution、forecasts、anomalies 与 guardrails 的 local MCP-first Cost Guard，`@vk0/agent-cost-mcp` 是窄而准的选择。如果你更需要 dashboard、native quick check 或通用 burn monitor，其他替代方案可能更适合先看。

| Tool | 更适合什么时候 | 替代方案更强的地方 | `@vk0/agent-cost-mcp` 更强的地方 |
|------|--------------------|---------------------------|------------------------------------------|
| [`ccusage`](https://github.com/ryoppippi/ccusage) | 你想要一个 polished 的 Claude Code usage / burn tracking 终端或 TUI dashboard。 | 更成熟的人类操作界面，以及更强的 operator-style monitoring UX。 | 提供 agent 可直接调用的 MCP-first access、更丰富的 per-tool/session forensics，以及在对话里直接给出 Cost Guard answers。 |
| **claude-usage** | 你只需要轻量 usage summaries 或 quick reporting，不太需要 agent-facing intervention logic。 | reporting-first framing 更简单，usage snapshots 更轻量。 | 当下一个问题是哪个 tool、branch 或 retry loop 导致 spend、agent 该不该停或改行为时更有用。 |
| **Claude-Code-Usage-Monitor** | 你的主要目标是 monitor-style 的 usage visibility。 | 如果核心任务是被动 monitoring，而 detailed local forensics 是次要的，它更合适。 | 在 local guardrails、subagent attribution、anomaly detection 与 MCP loop 内 actionable follow-up 上更强。 |
| [`Token Analyzer MCP`](https://github.com/proggreg/mcp-token-analyzer) | 你需要一个更通用的 MCP token-analysis utility，分析 payloads、prompts 或 message shapes。 | token-analysis framing 更广，不那么局限于 Claude Code session logs。 | 更专注于真实 Claude Code JSONL spend analysis、pricing-aware cost math 与 session-oriented Cost Guard workflows。 |
| [`CodeBurn`](https://github.com/getagentseal/codeburn) | 你更关心 burn-rate / usage monitoring 与 alerts，而不是 offline session forensics。 | 当核心问题是“我是不是烧得太快了？”而不是“哪个 branch、tool 或 retry loop 造成的？”时更强。 | 更适合 local Cost Guard workflows、tool attribution、branch/subagent breakdowns，以及无需 cloud 的 detailed post-run cost debugging。 |

几个诚实的 caveats：

- 如果你只想快速看一个 native number，那么 built-in `/cost` 或 `/usage` 仍然是最佳答案。
- 如果你的首要目标是 reporting-first 或 monitor-first experience，`ccusage`、`claude-usage`、Claude-Code-Usage-Monitor 可能更适合。
- 如果 burn-rate monitoring 比 local cost debugging detail 更重要，CodeBurn 可能更合适。
- `@vk0/agent-cost-mcp` 是刻意收窄范围的：本地 Claude Code JSONL logs、pricing-aware cost analysis、MCP-callable outputs，以及 agent loop 内的 guardrail-style answers。

**Best fit：** 适合 solo developers 和 small teams，他们希望 agent 能回答这样的问题：*token 到底花到哪里去了、是哪个 tool 或 branch 导致的、这种模式是否危险、接下来该改什么*，同时又不想把日志发到云端，也不想打开单独的 billing dashboard。

## FAQ

<details>
<summary><strong>它会把数据发到任何地方吗？</strong></summary>

不会。一切都在本地运行。server 从 `~/.claude/projects/` 读取 JSONL files，用 Node 做计算，然后把 JSON 返回给 MCP client。没有 telemetry、没有 analytics endpoint、没有 cloud sync。你甚至可以断网运行。
</details>

<details>
<summary><strong>成本估算准确吗？</strong></summary>

在我们的 dogfood sessions 中，它和 Claude Code 内建 `/cost` 的结果通常在 ~5% 以内。具体偏差取决于 `src/pricing.ts` 中的 pricing table，以及你 JSONL 里 usage fields 的完整程度。它 **不是** billing source of truth，做业务决策前请始终与真实的 Anthropic invoice 对账。
</details>

<details>
<summary><strong>支持 Cursor、Cline 或 Continue 的 sessions 吗？</strong></summary>

目前还不支持。当前 parser 只针对 Claude Code 的 JSONL session log format（`~/.claude/projects/**/*.jsonl`）。Cursor、Cline 与 Continue 会在不同位置、用不同格式记录日志。欢迎 PR，开 issue 时请附上日志样例。
</details>

<details>
<summary><strong>需要 API key 吗？</strong></summary>

不需要。不需要 Anthropic API key，不需要 npm token，也不需要任何认证。server 只读你的本地文件系统。
</details>

<details>
<summary><strong>为什么是 MCP，而不是 CLI？</strong></summary>

两者都支持。package 提供了一个 `bin` entry（`agent-cost-mcp <session.jsonl>`）用于终端里的一次性分析。但 MCP server 才是主表面：当 AI agent 能直接调用工具时，你就能在*成本发生的对话里*获得 cost insight。
</details>

<details>
<summary><strong>价格变了，定价表会自动更新吗？</strong></summary>

不会，这是刻意设计。`src/pricing.ts` 是一个 plain TypeScript module：predictable、auditable、forkable。Anthropic 发布新 rates 时，更新 constants 后重新运行即可。auto-update 会带来 network egress，这与 local-first principle 冲突。
</details>

<details>
<summary><strong>MCP server 没出现在客户端里，我该检查什么？</strong></summary>

1. 编辑配置后，**彻底重启客户端**。
2. **手动运行：** `npx -y @vk0/agent-cost-mcp`，你应该看到 MCP server 启动并在 stdio 上等待（Ctrl+C 退出）。如果报错，就是安装问题。
3. **查看 Claude Desktop logs：** `~/Library/Logs/Claude/mcp*.log`（macOS）或 `%APPDATA%\Claude\logs\mcp*.log`（Windows）。
4. **确认 Node ≥18：** `node --version`。这个 package 要求 Node 18+。
</details>

## 限制

- **这是估算，不是计费。** 成本来自 per-turn usage fields × 本地 pricing table，不能替代你的 Anthropic invoice。
- **Pricing table 需要手动更新。** 当费率变化时需要修改 `src/pricing.ts`，这是刻意设计的，不会偷偷做 network calls。
- **仅支持 Claude Code。** 不解析 Cursor/Cline/Continue 的 sessions。如果有需求，未来可能支持其他 clients。
- **本地文件读取。** server 只会读取你提供的 project path 下的 files，不会查询 Claude Code 的 live runtime state。
- **Structured JSON output。** 没有 rich dashboards、charts 或 web UI。这是 feature，不是 bug，MCP client 本身就是 UI。
- **Cache-read awareness 依赖源数据。** 如果 JSONL 里没有 cache-read/cache-creation token fields，这些部分会被报告为零。

## Standalone CLI

同一个 parser 也提供 CLI，用于没有 MCP client 时的一次性分析：

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --watch --watch-interval 5
```

`--watch` 会按间隔持续重新扫描目标 session log，并打印更新后的 compact summary。当 active coding session 还在持续累积成本时，这会很方便。

输出与 MCP 工具 `get_session_cost` 返回的 JSON 相同。

## 开发

克隆仓库后运行：

```bash
npm ci           # 安装依赖
npm run build    # 编译到 dist/
npm test         # vitest 单元测试
npm run lint     # tsc --noEmit
npm run smoke    # end-to-end MCP client smoke test
```

技术栈：TypeScript、`@modelcontextprotocol/sdk`、Zod、Vitest。

### Official MCP Registry recovery path

如果 npm / package metadata 已经正确，但 Official MCP Registry listing 需要一次 bounded re-publish，请触发专用 GitHub Actions workflow，而不是创建新 tag 或重新跑完整 release flow：

```bash
gh workflow run registry-republish.yml --repo vk0dev/agent-cost-mcp
```

这个 workflow 只会通过 GitHub OIDC 把 `server.json` 重新发布到 Official MCP Registry。它不会发布到 npm，也不会创建新 release。

## Changelog

请见 [CHANGELOG.md](./CHANGELOG.md)。本项目从 v1.0.0 起遵循 [semantic versioning](https://semver.org)。

## 贡献

欢迎在 [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp) 提交 issues 和 PR。若要增加 pricing table 条目、调整 log format 或支持其他 clients，请先开一个带 sample fixture 的 issue。

## 许可证

[MIT](./LICENSE) © vk0.dev
