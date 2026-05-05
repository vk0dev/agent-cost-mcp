# agent-cost-mcp

Claude Code 向け AI エージェントのためのローカル Cost Guard と runtime guardrails です。

現在の v2.3.0 リリース面は local-first を維持しつつ、ひとつの役割に集中しています。どこからコストが発生しているか、次にどこへ向かっているか、provider/model/tool ごとの attribution、`subtreeCost` による subagent tree の集約、そして hosted control plane なしで signed monitor-webhook alerts を送ることです。

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **Claude Code のための Cost Guard。** `@vk0/agent-cost-mcp` はローカル JSONL セッションログを読み取り、`/cost` の次に来る問い, つまり、どの tool、branch、retry loop、runaway pattern が実際にトークンを燃やしているのか、次に何を変えるべきか, に答えます。クラウドなし。API キー不要です。

**Languages:** [English](./README.md) · 日本語 · [简体中文](./README.zh-CN.md) · [Русский](./README.ru.md) · [Español](./README.es.md)

<a href="https://vk0dev.github.io/agent-cost-mcp"><img src="./docs/demo-cost-guard.gif" alt="agent-cost-mcp Cost Guard demo: anomaly trigger fires, low-ROI retry loop is flagged, and the agent stops at the hard budget cap" width="787"></a>

---

## 使いどころ

**Claude Code がコスト数値は出したけれど、理由までは説明してくれない** ときに使います。

典型的な Cost Guard のユースケース:

- **tool-heavy なセッション:** 一回の run でも複数 run でも、どの tools が cost share、context share、low-ROI call pattern を支配しているか見極める。
- **retry loops や runaway behavior:** repeated turns、abandoned tool calls、anomaly days、branch-level burn patterns を静かに積み上がる前に捉える。
- **pre-spend guardrails:** 次の run のコストを見積もり、budget thresholds を設定し、monitor alerts を出して、長い agent run が予算を越える前に止める。

Claude Code セッション向けに **ローカル・privacy-preserving・zero-setup の cost forensics と guardrails** が欲しいなら、これが canonical answer です。すべて `~/.claude/projects/` にある既存ログからユーザーのマシン上で動作します。

## 向いていないもの

これは **billing dashboard、procurement console、org-finance system、invoice source of truth** ではありません。

ローカル Claude Code ログから Cost Guard 的な答えを得たい開発者やオペレーター向けであり、chargeback reporting、company-wide spend accounting、live runtime introspection のためのものではありません。

## インストール

利用するクライアントを選んでください。どの方法でも `npx` を使うのでグローバルインストールは不要です。

### Claude Desktop

Claude Desktop の設定ファイルを編集します。

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

`mcpServers` に `agent-cost` エントリを追加します。

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

Claude Desktop を完全に終了して再起動してください。チャット入力欄右下の MCP インジケーターに 11 個の新しい tools が表示されるはずです。

### Claude Code

CLI で 1 行:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

または、プロジェクトルートの `.mcp.json` に project-scoped server を追加します。

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

> **Windows の場合:** `cmd /c` でラップしてください。
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

プロジェクトルートに `.cursor/mcp.json` を作成します。グローバルに入れるなら `~/.cursor/mcp.json` です。

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

Cline の MCP 設定を開き、MCP Servers アイコン → **Configure** から次を追加します。

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

### 動作確認

どのクライアントでも *"agent-cost はどんな tools を expose している?"* と聞いてください。おおむね次の 11 ツールが見えれば成功です。

- cost queries: `get_session_cost`, `get_tool_usage`, `get_cost_trend`, `get_subagent_tree`
- optimization analytics: `get_tool_roi`, `suggest_optimizations`, `detect_cost_anomalies`
- predictive: `get_cost_forecast`, `estimate_run_cost`
- configuration: `configure_budget`, `set_monitor_webhook`

表示されない場合は [FAQ](#faq) を確認してください。

## Marketplace / Discovery

現在確認済みの discovery surfaces:

- **npm:** `npx -y @vk0/agent-cost-mcp` による canonical install path
- **MCP Registry:** package metadata と registry-facing identity
- **Smithery:** 確認済みの third-party listing `https://smithery.ai/servers/unfucker/agent-cost-mcp`
- **mcp.so:** 確認済みの product page `https://mcp.so/server/agent-cost-mcp/vk0dev`

Glama は stable product-page URL の再確認が終わるまで、現時点では未検証とみなしてください。

Discovery surface ごとに metadata quality は多少異なる可能性がありますが、この package については Smithery と mcp.so の live presence は確認済みです。

この package を初めて見つけたなら、現時点の preferred path は npm でインストールし、Smithery か mcp.so で marketplace-style browsing を行うことです。

## Claude Code built-in `/cost` と `@vk0/agent-cost-mcp`

Claude Code 自体にも便利な基本的コスト可視化があります。`@vk0/agent-cost-mcp` はその次の分析レイヤーです。

### built-in `/cost` で十分なとき

- 現在のセッションについて素早い答えが欲しい
- native statusline や local session spend visibility だけで足りる
- active run 中に budget flags を確認したい

### `@vk0/agent-cost-mcp` を使うべきとき

- `get_tool_usage` による per-tool analysis が欲しい
- `get_subagent_tree` による parent/subagent attribution が必要
- `get_cost_forecast` による local forward-looking estimates が欲しい
- `configure_budget` による agent-readable guardrails が必要
- webhook notifications による alert routing が必要

### 一緒に使うのが最良

Claude Code の built-ins はその場の quick visibility に使い、次の問いが *どの tool が原因か、どの branch が予算を燃やしたか、時間とともに何が変わったか、次に agent は何をすべきか* になったら `@vk0/agent-cost-mcp` を使ってください。

この package は invoices、org-wide billing systems、live runtime introspection を置き換えるものではありません。Claude Code の session logs に対する structured cost analysis 用のローカル MCP surface です。

## Docs と how-to guides

フル reference ではなく具体的な operator workflow から始めたいなら、まずはこちらです。

- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

## ツール

11 個の MCP ツールはすべてローカル JSONL セッションログ上で動き、ひとつの Cost Guard の問いに集中しています。コストはどこに溜まっているのか、今のパターンはどれほど危険か、オペレーターや agent は何を変えるべきか, です。

**Cost queries (read-only):**

| Tool | 役割 |
|------|-------------|
| **`get_session_cost`** | Claude Code の単一セッションを解析し、token totals、turn count、cache usage、estimated USD cost を返します。後続の Cost Guard の質問を具体的な run summary に固定するためです。 |
| **`get_tool_usage`** | 単一セッションまたは project log directory を集計し、per-tool call counts と context-share percentages を返します。どの tool patterns が実際に spend を動かしているかを可視化します。 |
| **`get_cost_trend`** | session logs を日次の local cost trend にまとめ、per-day sessions、tokens、estimated spend を返します。anomalies や burn の上昇を推測ではなくデータで見られるようにします。 |
| **`get_subagent_tree`** | ローカル Claude Code run の parent-plus-subagent tree を返し、branch ごとに cost を合算します。どの branch や delegated path が予算を消費したのかを確認できます。 |

![subagent tree demo](docs/demo-subagent-tree.gif)

**Optimization analytics:**

| Tool | 役割 |
|------|-------------|
| **`get_tool_roi`** | cost share、linked results、context share を用いた bounded ROI heuristic で tools を順位付けし、low-efficiency や runaway-loop の典型をすばやく浮かび上がらせます。 |
| **`suggest_optimizations`** | 解析済み session log から cache-read ratios、abandoned tool calls、heaviest turns などを使って軽量な optimization suggestions を生成し、次に取るべき修正を具体化します。 |
| **`detect_cost_anomalies`** | 直近の local baseline と比較して unusually high / low な daily cost spikes をフラグし、sudden burn jumps、suspicious drops、unstable usage patterns を別 monitoring stack なしで見える化します。 |

**Predictive (pre-spend):**

| Tool | 役割 |
|------|-------------|
| **`get_cost_forecast`** | 直近の日次 trend data から bounded な local cost forecast を作り、過去に何が起きたかだけでなく次にどこへ向かうかを見られるようにします。履歴が短い場合も gracefully に劣化します。 |

![forecast demo: get_cost_forecast showing recency-weighted-average-rc2 local spend projection](docs/demo-forecast.gif)

![forecast fallback demo: sparse-history fallback lowers spike-driven overprojection and adds confidence metadata](docs/demo-forecast-fallback.gif)
| **`estimate_run_cost`** | prompt、model、期待される tool-call shape から planned run のコストを実行前に推定し、`{low, expected, high}` と confidence を返して pre-spend 判断を支えます。 |

**Configuration (write):**

| Tool | 役割 |
|------|-------------|
| **`configure_budget`** | daily または per-session の budget caps と tiered alert thresholds を設定し、次の cost-query tool が soft / hard spending boundary を越える前に machine-readable warning を返せるようにします。 |

![budget cap demo](docs/demo-budget-cap.gif)
| **`set_monitor_webhook`** | anomaly alerts、budget threshold crossings、runaway flags 用の HMAC-signed webhook target を登録し、Cost Guard signals をローカル session から operator workflow へ運べるようにします。 |

<details>
<summary><strong><code>get_session_cost</code> の出力例</strong></summary>

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
<summary><strong><code>get_tool_usage</code> の出力例</strong></summary>

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
<summary><strong><code>get_cost_trend</code> の出力例</strong></summary>

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
<summary><strong><code>suggest_optimizations</code> の出力例</strong></summary>

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

## 会話例

```
あなた: 今週 Claude Code にいくら使った?

Agent:  [get_cost_trend を days=7 で呼び出し]
        直近 7 日間で 12 セッション、合計 $4.82 です。
        最も高かった日は水曜日で、4 セッションで $1.47 でした。

あなた: どの tools がコンテキストを食っている?

Agent:  [get_tool_usage を呼び出し]
        Read (42 calls, 38% share), Grep (28 calls, 25%), Bash (19 calls, 17%).
        Read が支配的なので、結果チェーンの中で本当にそれだけのファイル読み込みが
        必要なのか見直す価値があります。

あなた: 直近セッションで何か quick wins はある?

Agent:  [suggest_optimizations を呼び出し]
        1. Cache reads がこのセッションの 34% を占めています。長いセッションの前に
           繰り返しの context blocks を削ると最初の改善になります。
        2. 7 つの tool calls に linked results がありません。abandoned invocations を確認してください。
```

## 仕組み

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

- **Parser** は Claude Code が出力する raw JSONL lines から per-turn usage fields (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) を直接読み取ります。
- **Pricing table** (`src/pricing.ts`) は Claude models の per-million-token rates を保持し、未知の model でも summary を返せるよう `default` fallback を持ちます。
- **MCP server** は 11 個の typed tools を stdio で公開し、local cost queries、per-tool/session analytics、anomaly detection、pre-run forecasting、budget caps、webhook alert configuration をカバーします。
- **デフォルトでは network egress はありません。** telemetry も API key も cloud sync もなく、唯一の optional outbound surface は alert delivery 用に明示的 opt-in で設定する `set_monitor_webhook` だけです。

## 代替ツールとの比較

これらのツールは一部重なりますが、最適化している問いが異なります。短く言えば、session forensics、per-tool attribution、forecasts、anomalies、guardrails のために agent が直接呼べる local MCP-first Cost Guard が欲しいなら `@vk0/agent-cost-mcp` が狭く的確な選択です。ダッシュボード、native quick check、一般的な burn monitor が主目的なら、他の選択肢の方が先に見る価値があるかもしれません。

| Tool | 向いている場面 | 代替の強み | `@vk0/agent-cost-mcp` の強み |
|------|--------------------|---------------------------|------------------------------------------|
| [`ccusage`](https://github.com/ryoppippi/ccusage) | Claude Code usage と burn tracking の polished terminal/TUI dashboard が欲しい。 | より成熟した human-facing dashboard 体験と operator-style monitoring UX。 | agent 向け MCP-first access、より深い per-tool/session forensics、会話の中で答えが返る Cost Guard。 |
| **claude-usage** | 軽量な usage summaries や quick reporting が欲しく、agent-facing intervention logic はあまり要らない。 | reporting-first framing がよりシンプルで usage snapshots も軽量。 | 次の問いが、どの tool、branch、retry loop が spend を起こしたか、agent は止まるべきか振る舞いを変えるべきか, のときに有用。 |
| **Claude-Code-Usage-Monitor** | 主目的が monitor-style の usage visibility。 | passive monitoring が主で、detailed local forensics が二の次のときに向く。 | local guardrails、subagent attribution、anomaly detection、MCP loop 内の actionable follow-up に強い。 |
| [`Token Analyzer MCP`](https://github.com/proggreg/mcp-token-analyzer) | payloads、prompts、message shapes をまたぐ一般的な MCP token-analysis utility が欲しい。 | Claude Code session logs に限定されない広い token-analysis framing。 | 実際の Claude Code JSONL spend analysis、pricing-aware cost math、session-oriented Cost Guard workflows に特化。 |
| [`CodeBurn`](https://github.com/getagentseal/codeburn) | offline session forensics より burn-rate / usage monitoring と alerts が重要。 | 主問いが “燃えすぎていないか?” であり “どの branch、tool、retry loop が原因か?” ではないときに強い。 | local Cost Guard workflows、tool attribution、branch/subagent breakdowns、cloud なしの detailed post-run cost debugging に強い。 |

正直な caveats もあります。

- 速い native number だけが欲しいなら、built-in `/cost` や `/usage` が依然として最適です。
- `ccusage`、`claude-usage`、Claude-Code-Usage-Monitor は reporting-first や monitor-first の優先度が高いときにより適しています。
- burn-rate monitoring が local cost debugging detail より重要なら CodeBurn の方が合う場合があります。
- `@vk0/agent-cost-mcp` は意図的に狭いスコープです。ローカル Claude Code JSONL logs、pricing-aware cost analysis、MCP-callable outputs、agent loop 内の guardrail-style answers に集中しています。

**Best fit:** ログをクラウドに送らず、別 billing dashboard を開かずに、*トークンはどこに消えたか、どの tool / branch が原因か、このパターンは危険か、次に何を変えるべきか* を agent に答えさせたい solo developers や small teams。

## FAQ

<details>
<summary><strong>データはどこかへ送られますか?</strong></summary>

いいえ。すべてローカルで動作します。サーバーは `~/.claude/projects/` から JSONL files を解析し、Node で計算し、JSON を MCP client に返します。telemetry も analytics endpoint も cloud sync もありません。ネットワークを切ったままでも実行できます。
</details>

<details>
<summary><strong>コスト推定はどれくらい正確ですか?</strong></summary>

私たちの dogfood sessions では、Claude Code built-in `/cost` とおおむね ~5% 以内で一致します。正確な差分は `src/pricing.ts` の pricing table と JSONL usage fields の完全性に依存します。これは **billing source of truth ではありません**。ビジネス判断の前には必ず Anthropic invoice と照合してください。
</details>

<details>
<summary><strong>Cursor、Cline、Continue の sessions でも動きますか?</strong></summary>

まだ対応していません。現在の parser は Claude Code の JSONL session log format (`~/.claude/projects/**/*.jsonl`) を対象にしています。Cursor、Cline、Continue は別の場所・別の形式でログを残します。PRs welcome です。ログ形状のサンプル付きで issue を開いてください。
</details>

<details>
<summary><strong>API キーは必要ですか?</strong></summary>

不要です。Anthropic API key も npm token も、いかなる認証も要りません。サーバーはローカルファイルシステムを読むだけです。
</details>

<details>
<summary><strong>なぜ CLI ではなく MCP なのですか?</strong></summary>

どちらも使えます。パッケージには one-off terminal analysis 用の `bin` entry (`agent-cost-mcp <session.jsonl>`) も含まれています。ただし主な surface は MCP server です。AI エージェントが tools を直接呼べると、cost insight を *支出が起きている会話の中* で得られるからです。
</details>

<details>
<summary><strong>料金が変わったら自動更新されますか?</strong></summary>

いいえ、意図的にそうしていません。`src/pricing.ts` は predictable、auditable、forkable な plain TypeScript module です。Anthropic が新しい rates を出したら constants を更新して再実行してください。auto-update は network egress を必要とし、local-first principle と衝突します。
</details>

<details>
<summary><strong>MCP サーバーがクライアントに出てきません。何を確認すべきですか?</strong></summary>

1. 設定を編集したら **クライアントを完全に再起動** してください。
2. **手動起動:** `npx -y @vk0/agent-cost-mcp`。MCP server が起動し stdio で待機するはずです (Ctrl+C で終了)。エラーなら install 側の問題です。
3. **Claude Desktop logs を確認:** `~/Library/Logs/Claude/mcp*.log` (macOS) または `%APPDATA%\Claude\logs\mcp*.log` (Windows)。
4. **Node ≥18 を確認:** `node --version`。この package は Node 18+ が必要です。
</details>

## 制限事項

- **推定であり課金ではありません。** コストは per-turn usage fields × ローカル pricing table から算出されます。Anthropic invoice の代わりにはなりません。
- **Pricing table は手動更新です。** `src/pricing.ts` は料金変更時に更新が必要で、意図的に silent network calls は行いません。
- **Claude Code 専用です。** Cursor/Cline/Continue sessions は解析しません。需要があれば他 clients にも広げる可能性はあります。
- **ローカルファイル探索です。** サーバーは指定された project path の files を読みます。Claude Code の live runtime state は問い合わせません。
- **Structured JSON output です。** rich dashboards、charts、web UI はありません。これは bug ではなく feature で、MCP client が UI です。
- **Cache-read awareness はソース依存です。** JSONL に cache-read/cache-creation token fields がなければ、それらは zero として報告されます。

## Standalone CLI

同じ parser は MCP client なしの one-off analysis 用 CLI としても使えます。

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --watch --watch-interval 5
```

`--watch` は target session log を一定間隔で再スキャンし、更新された compact summary を出力し続けます。active coding session がまだ cost を積み上げている間に便利です。

MCP の `get_session_cost` tool と同じ JSON を返します。

## 開発

リポジトリを clone して実行します。

```bash
npm ci           # dependencies をインストール
npm run build    # dist/ にコンパイル
npm test         # vitest unit tests
npm run lint     # tsc --noEmit
npm run smoke    # end-to-end MCP client smoke test
```

Stack: TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest。

### Official MCP Registry の recovery path

npm / package metadata が正しくても Official MCP Registry listing だけ bounded re-publish が必要な場合は、新しい tag や full release flow の再実行ではなく、専用の GitHub Actions workflow を使ってください。

```bash
gh workflow run registry-republish.yml --repo vk0dev/agent-cost-mcp
```

この workflow は `server.json` を GitHub OIDC 経由で Official MCP Registry に再 publish するだけです。npm publish も新しい release 作成も行いません。

## Changelog

[CHANGELOG.md](./CHANGELOG.md) を参照してください。本プロジェクトは v1.0.0 以降 [semantic versioning](https://semver.org) に従います。

## コントリビュート

Issues と PR は [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp) で歓迎します。pricing table の追加、log format の変更、他 clients のサポートを提案する場合は、まず sample fixture 付きの issue を開いてください。

## ライセンス

[MIT](./LICENSE) © vk0.dev
