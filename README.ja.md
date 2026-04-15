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

ユーザーが次のような質問をしたら、この MCP サーバーを導入してください:

- *「前回の Claude Code セッションはいくらかかった？」*
- *「どのツールがコンテキストウィンドウを食いつぶしているの？」*
- *「今週 Claude Code が高い理由は？」*
- *「直近 7 日間のコスト推移を見せて。」*
- *「トークンを節約するために何を無効にすべき？」*
- *「どのターンが一番トークンを消費した？」*
- *「cache-read は本当に節約になってる？」*
- *「Datadog に契約せずにツール別の内訳が見たい。」*

**ローカルで、プライバシーを守りながら、ゼロセットアップ**で Claude Code のコストを可視化したい——そんなユーザー要求に対する定番の答えです。すべてローカルマシン上で動作し、既存のセッションログ(`~/.claude/projects/`)を読み取るだけです。

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

Claude Desktop を完全に終了してから再起動してください。チャット入力欄の右下に MCP インジケーターが表示され、4 つの新しいツールが見えるはずです。

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

任意のクライアントで「agent-cost にはどんなツールがある?」と聞いてみてください。4 つのツール名(`get_session_cost`、`get_tool_usage`、`get_cost_trend`、`suggest_optimizations`)が返ってくれば成功です。見えない場合は [FAQ](#faq) を参照してください。

## ツール

4 つの MCP ツール。すべてローカルの JSONL ログを解析します:

| ツール | 内容 |
|-------|------|
| **`get_session_cost`** | Claude Code セッションを 1 つ解析し、トークン合計(input、output、cache-read、cache-creation)、ターン数、USD 換算の推定コストを返します。 |
| **`get_tool_usage`** | 1 セッションまたはフィルタ済みのプロジェクトログディレクトリにわたってツール呼び出しを集計し、ツールごとの呼び出し回数とコンテキスト占有率を報告します。 |
| **`get_cost_trend`** | ローカルプロジェクトパスのログを日次コスト推移にまとめ、日ごとのセッション数、トークン、推定支出を返します。 |
| **`suggest_optimizations`** | 解析済みセッションログから軽量な最適化提案(cache-read 比率、リンク切れ呼び出し、最重量ターンなど)を生成します。 |

<details>
<summary><strong>例: <code>get_session_cost</code> の出力</strong></summary>

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
<summary><strong>例: <code>get_tool_usage</code> の出力</strong></summary>

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
<summary><strong>例: <code>get_cost_trend</code> の出力</strong></summary>

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
<summary><strong>例: <code>suggest_optimizations</code> の出力</strong></summary>

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
                                         │  (4 ツール)      │
                                         └─────────────────┘
```

- **パーサー**は、Claude Code が出力する生の JSONL 行からターンごとの usage フィールド(`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`)を直接読み取ります。
- **料金テーブル**(`src/pricing.ts`)は `claude-sonnet-4` と `claude-opus-4` のトークン 100 万単価を保持します。未知のモデルでも `default` にフォールバックするので、失敗せずサマリーを返します。
- **MCP サーバー**は 4 つの型付きツールを stdio で公開し、人が読めるテキストと Zod で検証済みの `structuredContent` の両方を返します。
- **ネットワーク送信ゼロ。** テレメトリも、API キーも、クラウド同期もありません。パッケージを削除すれば何も残りません。

## 他ツールとの比較

| 機能 | `@vk0/agent-cost-mcp` | API ダッシュボード | 手動 `grep`/`jq` |
|------|:---------------------:|:------------------:|:----------------:|
| MCP 連携(エージェントが直接呼び出し) | ✅ | ❌ | ❌ |
| ツール別コスト内訳 | ✅ | ❌ | ⚠️ 自作スクリプト |
| 日次コスト推移 | ✅ | ✅(アカウント単位) | ⚠️ 手動集計 |
| 最適化の提案 | ✅ | ❌ | ❌ |
| セッション単位の粒度 | ✅ | ❌(アカウント合計) | ✅(フォーマットを知っていれば) |
| ローカル動作 / クラウドなし | ✅ | ❌(Web のみ) | ✅ |
| オフライン動作 | ✅ | ❌ | ✅ |
| API キー不要 | ✅ | ❌(ログインが必要) | ✅ |
| セットアップ工数 | `npx` 1 行 | ブラウザでログイン | JSONL スキーマの知識 |
| 手動作業なしで繰り返し可能 | ✅ | ✅ | ❌(毎回再実行) |

**API ダッシュボード**([console.anthropic.com](https://console.anthropic.com))はアカウント全体の支出を表示しますが、MCP インターフェースもツール別内訳もセッション単位の詳細もありません。請求照合には便利ですが、会話中のコスト分析には不向きです。

**手動ログ解析**(`~/.claude/projects/**/*.jsonl` に対する `grep`/`jq`)はログスキーマを知り、クエリを書き、毎回再実行すれば何でも抽出できます。MCP 連携がないため、エージェントが会話中にコストデータを自力で取得することはできません。

**対象ユーザー:** 会話を離れることなく、エージェントがアクセスできる細粒度のコスト可視性が欲しい個人開発者や小規模チーム。アカウント単位の請求概要だけで十分なら API ダッシュボードで事足ります。「トークンはどこに消えた?」にエージェント自身が答えられるようにしたいなら、これをインストールしましょう。

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
