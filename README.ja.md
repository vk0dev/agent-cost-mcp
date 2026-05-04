# agent-cost-mcp

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **ローカル動作の Claude Code コスト分析ツール。** JSONL セッションログを解析し、ツール別の支出、日次トレンド、最適化のヒントを可視化します。クラウド送信なし。API キー不要。

**Languages:** [English](./README.md) · 日本語 · [简体中文](./README.zh-CN.md) · [Русский](./README.ru.md) · [Español](./README.es.md)

---

## こんなときに使う

Claude Code の AI エージェント向け **ローカル Cost Guard / runtime guardrails** です (v2.2.0: budget cap の `warn`/`block` モードと provider attribution v0 を追加)。

単に「いくら使ったか」を見るだけでなく、次のような場面で使います。

- **runaway コスト** や retry storm を、予算が燃え切る前に止めたい
- エージェントが読める **budget intervention** をローカルで持たせたい
- どの **branch / subagent** が本当にコストを使ったか知りたい
- どの tool / turn / no-progress churn が spike を作ったか追いたい
- 次の run のコストを forecast / pre-run estimate で先に見たい

## インストール

クライアントを選んでください。どの方法も `npx` 経由なのでグローバルインストール不要です。

### Claude Desktop

Claude Desktop の設定ファイルを編集します:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

`mcpServers` 配下に `agent-cost` エントリを追加します:

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

Claude Desktop を完全に終了してから再起動してください。チャット入力欄の右下に MCP インジケーターが表示され、11 のツールが見えるはずです。

### Claude Code

ワンライナー:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

または、プロジェクトのルートにある `.mcp.json` にプロジェクトスコープのサーバーを追加します:

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

> **Windows の場合:** コマンドを `cmd /c` でラップしてください:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

プロジェクトのルートに `.cursor/mcp.json` を作成します(または全体インストールなら `~/.cursor/mcp.json`):

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

Cline の MCP 設定を開き(MCP Servers アイコン → **Configure**)、次を追加します:

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

任意のクライアントで「agent-cost にはどんなツールがある?」と聞いてみてください。次の 11 ツールが見えれば成功です。

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

見えない場合は [FAQ](#faq) を参照してください。

## Docs / How-to

フルリファレンスではなく、すぐ使える operator workflow から始めるならこちらです。

- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

## ツール

Claude Code のローカル JSONL ログを読む 11 個の MCP ツールで、Cost Guard surface を構成します。

## 会話例

```
ユーザー: 今週 Claude Code にどのくらい使った?

エージェント: [get_cost_trend を days=7 で呼び出し]
              直近 7 日間で 12 セッション、合計 $4.82 です。
              最も使った日は水曜日で、4 セッションで $1.47 でした。

ユーザー: コンテキストを食っているツールはどれ?

エージェント: [get_tool_usage を呼び出し]
              Read(42 回、38%)、Grep(28 回、25%)、Bash(19 回、17%)。
              Read が支配的です。すべてのファイル読み込みが本当に必要か
              見直してみてください。

ユーザー: 直近のセッションで何か手っ取り早い改善は?

エージェント: [suggest_optimizations を呼び出し]
              1. このセッションでは cache-read がトークンの 34% を占めています。
                 長いセッションの前に繰り返されるコンテキストブロックを削ってください。
              2. 7 回のツール呼び出しにリンク先の結果がありません。放置された
                 呼び出しを確認してください。
```

## 仕組み

```
  ~/.claude/projects/*.jsonl             ┌─────────────────┐
  (Claude Code のセッションログ) ────▶   │  JSONL パーサー │
                                         │  + pricing.ts   │
                                         └────────┬────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
  エージェントからの呼び出し(stdio) ────▶ │  MCP サーバー   │ ─── JSON レスポンス
                                         │  (11 ツール)     │
                                         └─────────────────┘
```

- **パーサー**は、Claude Code が出力する生の JSONL 行からターンごとの usage フィールド(`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`)を直接読み取ります。
- **料金テーブル**(`src/pricing.ts`)は `claude-sonnet-4` と `claude-opus-4` のトークン 100 万単価を保持します。未知のモデルでも `default` にフォールバックするので、失敗せずサマリーを返します。
- **MCP サーバー**は 11 の型付きツールを stdio で公開し、人が読めるテキストと Zod で検証済みの `structuredContent` の両方を返します。
- **ネットワーク送信ゼロ。** テレメトリも、API キーも、クラウド同期もありません。パッケージを削除すれば何も残りません。

## 他ツールとの比較

これらのツールは一部重なりますが、最適化している問いが違います。短く言うと、Claude Code ログ向けの **local MCP-first Cost Guard** が欲しいなら `@vk0/agent-cost-mcp`、dashboard・usage-first reporting・burn monitor が主目的なら別の選択肢が向いていることがあります。

| ツール | 向いている場面 | `@vk0/agent-cost-mcp` が強い点 |
| --- | --- | --- |
| **ccusage** | polished な terminal/TUI で usage reporting と履歴を見たい | usage dashboard よりも、agent-readable budget actions、branch attribution、local guardrails が必要なときに強い |
| **claude-usage** | 軽量な usage summaries や quick reporting が欲しい | runaway detection、tool-level forensics、「何が burn を起こしたか」の説明に強い |
| **Claude-Code-Usage-Monitor** | monitor-style に usage patterns を見たい | monitoring だけでなく、subagent attribution、anomaly detection、MCP loop 内の actionable follow-up に強い |
| **Token Analyzer MCP** | Claude Code session logs に限定しない汎用 token analysis が欲しい | 実際の Claude Code JSONL ログ、pricing-aware Cost Guard、budget thresholds、session-oriented analysis に強い |
| **CodeBurn** | local forensic より burn-rate monitoring / alerts を重視する | 「どの branch / tool / retry loop が burn を作ったか、エージェントは止まるべきか」に答えるときに強い |

正直な caveat:

- 速い native number だけなら built-in `/cost` や `/usage` が最適です。
- reporting-first / monitor-first workflow では `ccusage`、`claude-usage`、Claude-Code-Usage-Monitor、CodeBurn のほうが合う場合があります。
- `@vk0/agent-cost-mcp` は意図的にスコープを絞っています。対象はローカル Claude Code JSONL ログ、pricing-aware cost analysis、guardrail-style answers inside the agent loop です。

## FAQ

<details>
<summary><strong>データはどこかに送信されますか?</strong></summary>

いいえ。すべてローカルで動作します。サーバーは `~/.claude/projects/` ディレクトリから JSONL ファイルを解析し、Node で計算を行い、JSON を MCP クライアントに返すだけです。テレメトリも、アナリティクスエンドポイントも、クラウド同期もありません。ネットワークを切って実行することもできます。
</details>

<details>
<summary><strong>コスト推定はどの程度正確ですか?</strong></summary>

ドッグフーディングセッションでは、Claude Code 内蔵の `/cost` と約 ±5% 以内で一致しています。正確な誤差は `src/pricing.ts` の料金テーブルと JSONL の usage フィールドの完全性に依存します。**請求の信頼できる情報源ではありません**。ビジネス判断の前には必ず Anthropic の実際の請求と照合してください。
</details>

<details>
<summary><strong>Cursor、Cline、Continue のセッションでも動きますか?</strong></summary>

現時点ではいいえ。パーサーは Claude Code の JSONL ログ形式(`~/.claude/projects/**/*.jsonl`)を対象にしています。Cursor、Cline、Continue はそれぞれ別の場所・形式でログを取ります。PR は歓迎です。サンプルログを添えて issue を立ててください。
</details>

<details>
<summary><strong>API キーは必要ですか?</strong></summary>

不要です。Anthropic API キーも、npm トークンも、いかなる認証も必要ありません。サーバーはローカルファイルシステムを読み取るだけです。
</details>

<details>
<summary><strong>なぜ CLI ではなく MCP?</strong></summary>

両方サポートしています。パッケージにはターミナルから 1 回限りの解析ができる `bin` エントリ(`agent-cost-mcp <session.jsonl>`)も含まれます。ただし主戦場は MCP サーバーです。AI エージェントがツールを直接呼び出せれば、支出が発生している**会話の中で**コストを把握できます。
</details>

<details>
<summary><strong>料金が変更されました。テーブルは自動更新されますか?</strong></summary>

いいえ、意図的にそうしています。`src/pricing.ts` はプレーンな TypeScript モジュール——予測可能、監査可能、フォーク可能です。Anthropic が新しい料金を公開したら、定数を更新して再実行してください。自動更新はネットワーク送信を伴い、local-first の原則と矛盾します。
</details>

<details>
<summary><strong>MCP サーバーがクライアントに表示されません。何を確認すべき?</strong></summary>

1. 設定ファイルを編集した後、**クライアントを完全に再起動**する。
2. **手動で起動してみる:** `npx -y @vk0/agent-cost-mcp` — MCP サーバーが起動し stdio で待機するはずです(Ctrl+C で終了)。エラーになる場合はインストール側の問題です。
3. **Claude Desktop のログを確認:** `~/Library/Logs/Claude/mcp*.log`(macOS)または `%APPDATA%\Claude\logs\mcp*.log`(Windows)。
4. **Node ≥18 であることを確認:** `node --version`。このパッケージは Node 18 以上が必要です。
</details>

## 制限事項

- **推定であり、請求ではありません。** コストはターン単位の usage × ローカル料金テーブルから算出されます。Anthropic の請求書の代わりにはなりません。
- **料金テーブルは手動更新。** 料金が変わったら `src/pricing.ts` を更新してください(意図的な仕様 — 暗黙のネットワーク呼び出しはしません)。
- **Claude Code のみ対応。** Cursor/Cline/Continue のセッションは解析しません。要望があれば他クライアントの対応も検討します。
- **ローカルファイル探索。** サーバーは指定されたプロジェクトパスからファイルを読み取ります。Claude Code のランタイム状態を問い合わせることはしません。
- **構造化 JSON 出力。** 豪華なダッシュボードもグラフも Web UI もありません。それが設計意図です。MCP クライアントが UI です。
- **cache-read の扱いはソース依存。** JSONL ログに cache-read/cache-creation フィールドがない場合、これらの値はゼロとして報告されます。

## スタンドアロン CLI

MCP クライアントなしでワンショット解析したい場合、同じパーサーを CLI として使えます:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
```

MCP ツール `get_session_cost` と同じ JSON を返します。

## 開発

リポジトリをクローンして実行:

```bash
npm ci           # 依存関係をインストール
npm run build    # dist/ へコンパイル
npm test         # vitest ユニットテスト
npm run lint     # tsc --noEmit
npm run smoke    # MCP クライアントの end-to-end スモークテスト
```

スタック: TypeScript、`@modelcontextprotocol/sdk`、Zod、Vitest。

## 変更履歴

[CHANGELOG.md](./CHANGELOG.md) を参照。本プロジェクトは v1.0.0 以降、[semantic versioning](https://semver.org) に従います。

## コントリビュート

Issue と PR は [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp) まで。料金テーブルの追加、ログフォーマットの変更、他クライアントのサポートについては、まずサンプルフィクスチャを添えて issue を立ててください。

## ライセンス

[MIT](./LICENSE) © vk0.dev
