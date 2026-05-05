# agent-cost-mcp

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **本地运行的 Claude Code 成本分析器。** 解析你的 JSONL 会话日志,呈现每个工具的消耗、每日趋势和优化建议。零云端,无需 API 密钥。

> **v2.3.0 的当前发布表面：** 本地 cost guard、forward-looking forecast、按 provider/model/tool 的 attribution、通过 `subtreeCost` 汇总 subagent tree，以及无需 hosted control plane 的 signed monitor-webhook alerts。

**语言:** [English](./README.md) · [日本語](./README.ja.md) · 简体中文 · [Русский](./README.ru.md) · [Español](./README.es.md)

---

## 何时使用

这是面向 Claude Code 中 AI agent 的**本地 Cost Guard / runtime guardrails**。

它不只是回答“花了多少钱”，而是在下面这些场景更有价值：

- 想在预算烧穿之前发现 **runaway 成本**、loop 或 retry storm
- 想给 agent 一个可读取的本地 **budget intervention** 机制
- 想知道到底是哪个 **branch / subagent** 烧掉了预算
- 想把成本 spike 追到具体的 tool、turn 或 no-progress churn
- 想在启动前用 forecast / pre-run estimate 先看下一次 run 的成本

## 安装

选择你的客户端。所有方式都通过 `npx` 运行,无需全局安装。

### Claude Desktop

编辑 Claude Desktop 的配置文件:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

在 `mcpServers` 下添加 `agent-cost` 条目:

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

完全退出并重新启动 Claude Desktop。聊天输入框右下角的 MCP 指示器应该会显示 11 个新工具。

### Claude Code

一行命令:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

或者在项目根目录的 `.mcp.json` 中添加项目作用域的服务器:

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

> **Windows 用户:** 把命令包在 `cmd /c` 里:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

在项目根目录创建 `.cursor/mcp.json`(或者全局安装用 `~/.cursor/mcp.json`):

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

打开 Cline 的 MCP 设置(点击 MCP Servers 图标 → **Configure**)并添加:

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

### 验证安装

在任一客户端里问:*"agent-cost 暴露了哪些工具?"* —— 你应该看到这 11 个工具名:

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

如果没看到,参考 [FAQ](#faq)。

## Docs / How-to

如果你不想先读完整 reference，而是想直接看可执行的 operator workflow，可以先看这里：

- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

## 工具

共有 11 个 MCP 工具，读取本地 Claude Code JSONL 日志，组成当前的 Cost Guard surface。

## 对话示例

```
你:       我这周在 Claude Code 上花了多少?

Agent:    [调用 get_cost_trend,days=7]
          最近 7 天你运行了 12 次会话,总计 $4.82。
          开销最大的是周三,4 次会话共 $1.47。

你:       哪些工具在吃我的上下文?

Agent:    [调用 get_tool_usage]
          Read(42 次,38% 占比)、Grep(28 次,25%)、Bash(19 次,17%)。
          Read 占主导——看看是不是每次文件读取都还必要。

你:       我上次会话有什么快速可做的优化吗?

Agent:    [调用 suggest_optimizations]
          1. 这次会话里 cache-read 占了 34% 的 token——在长会话前把
             重复的上下文块裁掉。
          2. 有 7 次工具调用没有关联结果——检查一下被放弃的调用。
```

## 工作原理

```
  ~/.claude/projects/*.jsonl            ┌─────────────────┐
  (Claude Code 会话日志)        ──────▶ │  JSONL 解析器    │
                                        │  + pricing.ts   │
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
  Agent 调用(stdio MCP)       ──────▶  │  MCP 服务器      │ ─── JSON 响应
                                        │  (11 个工具)     │
                                        └─────────────────┘
```

- **解析器**直接从 Claude Code 生成的原始 JSONL 行读取每轮的 usage 字段(`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`)。
- **定价表**(`src/pricing.ts`)保存已知模型的每百万 token 价格，并有 `default` 兜底，保证未知模型也能返回摘要而不是失败。
- **MCP 服务器**通过 stdio 暴露 11 个类型化工具，同时返回人类可读文本和经 Zod 校验的 `structuredContent`。
- **零网络出口。** 没有遥测、没有 API 密钥、没有云端同步。卸载这个包后什么都不会留下。

v2.2.0 补充：
- 预算上限支持 enforcement 模式：`mode: "warn" | "block"`（`warn` 保持提示型行为，`block` 可视为硬性拒绝信号）。
- 增加 provider attribution v0：`anthropic` / `openai` / `google` / `unknown`（按模型前缀确定），便于区分不同 provider 的会话与成本分析。

## 与其他方案对比

这些工具有交集，但它们优化的问题并不一样。简短地说，如果你要的是面向 Claude Code 日志的 **本地 MCP-first Cost Guard**，选 `@vk0/agent-cost-mcp`；如果你更想要 dashboard、usage-first reporting 或 burn monitor，其他方案可能更适合。

| 工具 | 更适合的场景 | `@vk0/agent-cost-mcp` 更强的地方 |
| --- | --- | --- |
| **ccusage** | 需要 polished 的终端/TUI usage reporting 和历史查看 | 如果你需要 local guardrails、branch attribution、agent-readable budget actions，而不只是 usage dashboard，它更强 |
| **claude-usage** | 需要轻量级 usage summaries 和快速 reporting | 如果重点是 runaway detection、tool-level forensics，以及回答“到底什么烧掉了预算？”，它更强 |
| **Claude-Code-Usage-Monitor** | 主要想持续监看 usage patterns | 如果除了监控，还要 subagent attribution、anomaly detection、以及 MCP loop 内的 actionable follow-up，它更强 |
| **Token Analyzer MCP** | 需要不局限于 Claude Code session logs 的通用 token analysis | 如果你需要基于真实 Claude Code JSONL 的 pricing-aware Cost Guard、budget thresholds 和 session-oriented analysis，它更强 |
| **CodeBurn** | 更关心 burn-rate monitoring / alerts，而不是本地 forensic 调试 | 如果你要回答“哪个 branch / tool / retry loop 导致了 burn，agent 现在该不该停？”，它更强 |

需要诚实说明的是：

- 如果你只想看一个快速的原生数字，built-in `/cost` 或 `/usage` 仍然是最好选择。
- 如果你的工作流更偏 reporting-first 或 monitor-first，那么 `ccusage`、`claude-usage`、Claude-Code-Usage-Monitor 或 CodeBurn 可能更顺手。
- `@vk0/agent-cost-mcp` 是刻意收窄范围的：它专注于本地 Claude Code JSONL、pricing-aware cost analysis，以及 agent loop 内的 guardrail-style answers。

## FAQ

<details>
<summary><strong>它会把数据发到哪里吗?</strong></summary>

不会。一切都在本地运行。服务器从你的 `~/.claude/projects/` 目录解析 JSONL 文件,用 Node 做数学计算,再把 JSON 返回给 MCP 客户端。没有遥测、没有分析端点、没有云同步。你完全可以在断网的情况下运行它。
</details>

<details>
<summary><strong>成本估算准吗?</strong></summary>

在我们的 dogfood 会话上,估算值和 Claude Code 内置的 `/cost` 输出相差在 ~5% 以内。具体偏差取决于 `src/pricing.ts` 的定价表以及你 JSONL 里 usage 字段的完整度。它**不是**计费真相来源——做出业务决定前,请始终和 Anthropic 的实际账单对账。
</details>

<details>
<summary><strong>支持 Cursor、Cline 或 Continue 的会话吗?</strong></summary>

目前不支持。解析器现在针对 Claude Code 的 JSONL 会话日志格式(`~/.claude/projects/**/*.jsonl`)。Cursor、Cline 和 Continue 在不同的位置用不同的格式记录会话。欢迎 PR —— 带着样例日志开一个 issue。
</details>

<details>
<summary><strong>需要 API 密钥吗?</strong></summary>

不需要。既不需要 Anthropic API 密钥,也不需要 npm token,任何认证都不需要。服务器只对你的本地文件系统做只读操作。
</details>

<details>
<summary><strong>为什么用 MCP 而不是 CLI?</strong></summary>

两个都支持。这个包附带 `bin` 入口(`agent-cost-mcp <session.jsonl>`),方便在终端做一次性分析。但 MCP 服务器才是主战场:当你的 AI agent 可以直接调用这些工具时,你就能**在产生花销的对话里**立刻看到成本。
</details>

<details>
<summary><strong>价格变了,定价表会自动更新吗?</strong></summary>

不会,这是刻意设计。`src/pricing.ts` 是一个普通的 TypeScript 模块——可预测、可审计、可 fork。Anthropic 公布新价格后,更新常量再重启。自动更新意味着网络流量,这和 local-first 原则冲突。
</details>

<details>
<summary><strong>MCP 服务器在客户端里没出现,该排查什么?</strong></summary>

1. 编辑配置文件后,**完全重启**客户端。
2. **手动运行:** `npx -y @vk0/agent-cost-mcp` — 应该会启动一个 MCP 服务器并在 stdio 上等待(Ctrl+C 退出)。如果报错,就是安装侧的问题。
3. **查看 Claude Desktop 日志:** `~/Library/Logs/Claude/mcp*.log`(macOS)或 `%APPDATA%\Claude\logs\mcp*.log`(Windows)。
4. **确认 Node ≥18:** `node --version`。本包需要 Node 18 及以上。
</details>

## 局限

- **估算,而非账单。** 成本来自按轮次的 usage × 本地定价表。不能替代你的 Anthropic 账单。
- **定价表需手动更新。** 价格变化时更新 `src/pricing.ts`(刻意设计——不做隐式的网络调用)。
- **只支持 Claude Code。** 不解析 Cursor/Cline/Continue 的会话。如有需求,未来可能添加。
- **本地文件发现。** 服务器从你传入的项目路径读取文件,不查询 Claude Code 的运行时状态。
- **结构化 JSON 输出。** 没有仪表板、没有图表、没有 Web UI。这是特性,不是 bug —— MCP 客户端就是 UI。
- **cache-read 依赖数据源。** 如果 JSONL 日志里没有 cache-read/cache-creation 字段,这些组件会被记为零。

## 独立 CLI

同一个解析器也能作为 CLI 使用,不需要 MCP 客户端:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
```

输出和 MCP 工具 `get_session_cost` 相同的 JSON。

## 开发

克隆仓库后执行:

```bash
npm ci           # 安装依赖
npm run build    # 编译到 dist/
npm test         # vitest 单元测试
npm run lint     # tsc --noEmit
npm run smoke    # 端到端 MCP 客户端冒烟测试
```

技术栈:TypeScript、`@modelcontextprotocol/sdk`、Zod、Vitest。

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。本项目从 v1.0.0 起遵循 [semantic versioning](https://semver.org)。

## 贡献

欢迎在 [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp) 提交 issues 和 PR。若要添加新的定价条目、变更日志格式或支持其他客户端,请先开一个带样例 fixture 的 issue。

## 许可证

[MIT](./LICENSE) © vk0.dev
