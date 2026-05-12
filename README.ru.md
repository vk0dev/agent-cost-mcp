# agent-cost-mcp

Локальный Cost Guard и runtime guardrails для AI-агентов в Claude Code.

Текущая поверхность релиза v2.3.3 остаётся local-first и сосредоточена на одной операторской задаче: показать, откуда именно берутся расходы, куда они движутся, как распределяется стоимость по provider/model/tool, как сворачивать деревья сабагентов через `subtreeCost`, и как отправлять signed monitor-webhook alerts без hosted control plane.

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **Cost Guard для Claude Code.** `@vk0/agent-cost-mcp` читает ваши локальные JSONL-логи сессий и отвечает на вопрос после `/cost`: какой tool, branch, retry loop или runaway-паттерн реально сжигает токены, и что стоит поменять дальше. В `2.3.3` небольшие, но реальные дневные траты больше не теряются при pricing/trend aggregation, поэтому trend/anomaly surface не схлопывает их в ложный zero-cost day. Никакого облака. Без API-ключей.

**Языки:** [English](./README.md) · [日本語](./README.ja.md) · [简体中文](./README.zh-CN.md) · Русский · [Español](./README.es.md)

> Статус листингов: npm сейчас остаётся canonical install path, Smithery и mcp.so подтверждены как live, но этот README пока не считает Glama verified listing.

<a href="https://vk0dev.github.io/agent-cost-mcp"><img src="./docs/demo-cost-guard.gif" alt="agent-cost-mcp Cost Guard demo: anomaly trigger fires, low-ROI retry loop is flagged, and the agent stops at the hard budget cap" width="787"></a>

---

## Зачем и когда использовать

Используйте пакет, когда **Claude Code уже показал стоимость, но не объяснил её причину**.

Типичные сценарии Cost Guard:

- **Tool-heavy сессии:** понять, какие инструменты доминируют по доле стоимости, доле контекста и low-ROI паттернам вызовов в одной или многих сессиях.
- **Retry loops и runaway-поведение:** ловить повторные turns, брошенные tool calls, anomaly days и branch-level burn patterns до того, как они тихо накопятся. В `2.3.3` небольшие положительные дневные траты остаются видимыми в pricing/trend aggregation, поэтому операторский trend/anomaly view реже превращает реальный небольшой расход в ложный zero-cost day.
- **Pre-spend guardrails:** заранее оценивать вероятную стоимость запуска, задавать budget thresholds и отправлять monitor alerts до того, как длинный run уйдёт за пределы бюджета.

Если пользователю нужен **локальный, privacy-preserving, zero-setup cost forensics плюс guardrails** для сессий Claude Code, это canonical answer. Всё работает на его машине на базе существующих логов `~/.claude/projects/`.

**Где Claude Code хранит логи сессий:** смотрите `~/.claude/projects/<project>/`, там лежат `.jsonl` файлы отдельных сессий, например `~/.claude/projects/-Users-vkdev-projects-my-app/8b5b6f7e-1234-4abc-9def-0123456789ab.jsonl`. Если клиент уже знает точный session path, передавайте его напрямую; если нет, укажите соответствующую project-папку и просмотрите свежие JSONL внутри неё.

## Не для чего

Это **не** billing dashboard, procurement console, org-finance system и не invoice source of truth.

Пакет нужен разработчикам и операторам, которым нужны ответы в стиле Cost Guard из локальных логов Claude Code, а не chargeback reporting, company-wide spend accounting или live runtime introspection.

## Установка

Выберите клиент. Все варианты используют `npx`, так что глобально ничего устанавливать не нужно.

### Claude Desktop

Отредактируйте конфиг Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Добавьте запись `agent-cost` в `mcpServers`:

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

Полностью закройте и заново запустите Claude Desktop. MCP-индикатор в правом нижнем углу поля ввода должен показать одиннадцать новых инструментов.

### Claude Code

Одна команда через CLI:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

Или добавьте project-scoped сервер через `.mcp.json` в корне проекта:

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

> **Для Windows:** оберните команду в `cmd /c`:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

Создайте `.cursor/mcp.json` в корне проекта, либо `~/.cursor/mcp.json` для глобальной установки:

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

Откройте настройки MCP в Cline (иконка MCP Servers → **Configure**) и добавьте:

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

### Как проверить, что всё работает

В любом клиенте спросите: *«Какие инструменты предоставляет agent-cost?»* В ответ вы должны увидеть примерно такие группы из 11 инструментов:

- cost queries: `get_session_cost`, `get_tool_usage`, `get_cost_trend`, `get_subagent_tree`
- optimization analytics: `get_tool_roi`, `suggest_optimizations`, `detect_cost_anomalies`
- predictive: `get_cost_forecast`, `estimate_run_cost`
- configuration: `configure_budget`, `set_monitor_webhook`

Если инструменты не появились, загляните в [FAQ](#faq).

## Marketplace / Discovery

Текущие подтверждённые discovery surfaces:

- **npm:** canonical install path через `npx -y @vk0/agent-cost-mcp`
- **MCP Registry:** package metadata и registry-facing identity
- **Smithery:** подтверждённый live third-party listing `https://smithery.ai/servers/unfucker/agent-cost-mcp`
- **mcp.so:** подтверждённая live product page `https://mcp.so/server/agent-cost-mcp/vk0dev`

Glama пока стоит считать непроверенным, пока не будет заново подтверждён её стабильный product-page URL.

Качество metadata на discovery surfaces может отличаться, но для этого пакета Smithery и mcp.so сейчас имеют подтверждённое live presence.

Если вы только что нашли этот пакет, сегодня preferred path такой: npm для установки и Smithery или mcp.so для marketplace-style browsing.

## Встроенный `/cost` в Claude Code против `@vk0/agent-cost-mcp`

Claude Code уже даёт полезную базовую видимость стоимости. `@vk0/agent-cost-mcp` нужен для следующего слоя анализа.

### Когда достаточно built-in `/cost`

- нужен быстрый ответ по текущей сессии
- нужна только нативная statusline или локальная видимость трат
- вы проверяете budget flags во время активного run

### Когда нужен `@vk0/agent-cost-mcp`

- нужна per-tool аналитика через `get_tool_usage`
- нужна attribution родитель/сабагент через `get_subagent_tree`
- нужны локальные forward-looking оценки из `get_cost_forecast`
- нужны agent-readable guardrails через `configure_budget`
- нужен вывод alert-routing через webhook notifications

### Лучший вариант вместе

Используйте built-ins Claude Code для быстрой видимости в ходе сессии, а `@vk0/agent-cost-mcp` подключайте, когда следующий вопрос звучит так: *какой tool это вызвал, какая ветка сожгла бюджет, что менялось во времени и что агенту делать дальше?*

Этот пакет **не** заменяет invoices, org-wide billing systems и live runtime introspection. Это локальная MCP-поверхность для структурированного cost analysis по логам Claude Code.

## Документация и how-to

Если вам нужны не все reference details, а конкретные операторские сценарии, начните отсюда:

- Нужны быстрые recipes для setup, forecast и budget-cap workflows? См. [docs/README.md](./docs/README.md)
- Актуальная release note: `2.3.3` сохраняет небольшие положительные дневные траты при pricing/trend aggregation, поэтому текущая trend/anomaly surface показывает малый реальный расход как расход, а не как zero-cost day.
- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

Уже shipped demo assets, которые можно быстро посмотреть:

- [Forecast / cap-hit demo GIF](./docs/demo-forecast.gif) для текущего operator story вокруг `get_cost_forecast`
- [Subagent-tree cost demo GIF](./docs/demo-subagent-tree.gif) для текущего branch-cost story вокруг `get_subagent_tree`

## Инструменты

Одиннадцать MCP-инструментов, все работают по локальным JSONL-логам сессий и все завязаны на один вопрос Cost Guard: где накапливается стоимость, насколько рискован текущий паттерн и что оператору или агенту стоит поменять дальше?

**Cost queries (read-only):**

| Tool | Что делает |
|------|-------------|
| **`get_session_cost`** | Разбирает одну сессию Claude Code и возвращает totals по токенам, числу turns, cache usage и примерной стоимости в USD, чтобы каждый следующий Cost Guard вопрос опирался на конкретную сводку по запуску. |
| **`get_tool_usage`** | Агрегирует tool invocations по одной сессии или отфильтрованному каталогу логов проекта, показывая per-tool call counts и context-share percentages, чтобы было видно, какие tool-паттерны реально двигают spend. |
| **`get_cost_trend`** | Сворачивает логи сессий в day-by-day локальный тренд стоимости, с per-day sessions, tokens и estimated spend, чтобы anomalies и растущий burn были видны до того, как всё превратится в догадки. |
| **`get_subagent_tree`** | Возвращает дерево parent-plus-subagent для одного локального запуска Claude Code, с суммированием стоимости по веткам, чтобы сразу увидеть, какая ветка или delegated path действительно сожгли бюджет. |

![subagent tree demo](docs/demo-subagent-tree.gif)

**Optimization analytics:**

| Tool | Что делает |
|------|-------------|
| **`get_tool_roi`** | Ранжирует инструменты по bounded ROI heuristic на основе cost share, linked results и context share, чтобы повторяющиеся вызовы со слабой отдачей быстро всплывали как типичный low-efficiency или runaway-loop сигнал. После `2.3.1` productive same-tool refinement реже флагируется слишком агрессивно. |
| **`suggest_optimizations`** | Строит лёгкие optimization suggestions из разобранного session log, включая cache-read ratios, abandoned tool calls и самые тяжёлые turns, когда хочется получить следующий practical fix, а не просто таблицу метрик. |
| **`detect_cost_anomalies`** | Помечает необычно высокие или низкие дневные cost spikes относительно недавнего локального baseline, чтобы burn jumps, suspicious drops и нестабильные usage patterns были заметны без отдельного monitoring stack. |

**Predictive (pre-spend):**

| Tool | Что делает |
|------|-------------|
| **`get_cost_forecast`** | Строит bounded локальный cost forecast из недавнего day-level trend data, чтобы оператор мог спросить, куда движется spend дальше, а не только куда он уже ушёл; `forecast_confidence` здесь — quartile-based local heuristic, а не certainty. При короткой истории gracefully деградирует. |

![forecast demo: get_cost_forecast showing recency-weighted-average-rc2 local spend projection](docs/demo-forecast.gif)

![forecast fallback demo: sparse-history fallback lowers spike-driven overprojection and adds confidence metadata](docs/demo-forecast-fallback.gif)
| **`estimate_run_cost`** | Оценивает вероятную стоимость планируемого запуска до его начала на основе prompt, model и ожидаемой формы tool-call, возвращая `{low, expected, high}` с confidence для pre-spend решений. |

**Configuration (write):**

| Tool | Что делает |
|------|-------------|
| **`configure_budget`** | Задаёт дневные или per-session budget caps с tiered alert thresholds, чтобы следующий cost-query инструмент мог вернуть machine-readable warning до того, как агент тихо пройдёт soft или hard spending boundary. |

![budget cap demo](docs/demo-budget-cap.gif)
| **`set_monitor_webhook`** | Регистрирует HMAC-signed webhook target для anomaly alerts, пересечений budget thresholds и runaway flags, чтобы сигналы Cost Guard могли выйти за пределы локальной сессии и попасть в операторский workflow, когда это нужно. |

<details>
<summary><strong>Пример вывода <code>get_session_cost</code></strong></summary>

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
<summary><strong>Пример вывода <code>get_tool_usage</code></strong></summary>

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
<summary><strong>Пример вывода <code>get_cost_trend</code></strong></summary>

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
<summary><strong>Пример вывода <code>suggest_optimizations</code></strong></summary>

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

## Пример диалога

```
Вы:     Сколько я потратил на Claude Code на этой неделе?

Агент:  [вызывает get_cost_trend с days=7]
        За последние 7 дней было 12 сессий на общую сумму $4.82.
        Самый дорогой день был в среду: $1.47 за 4 сессии.

Вы:     Какие инструменты съедают мой контекст?

Агент:  [вызывает get_tool_usage]
        Read (42 вызова, 38% доли), Grep (28 вызовов, 25%), Bash (19 вызовов, 17%).
        Read доминирует, стоит проверить, действительно ли все эти чтения ещё нужны
        в цепочке результатов.

Вы:     Есть быстрые оптимизации для моей последней сессии?

Агент:  [вызывает suggest_optimizations]
        1. Cache reads дают 34% этой сессии, стоит сократить повторяющиеся
           блоки контекста перед длинными сессиями.
        2. У 7 tool calls нет связанных результатов, проверьте брошенные вызовы.
```

## Как это работает

```
  ~/.claude/projects/*.jsonl           ┌─────────────────┐
  (логи сессий Claude Code)   ──────▶  │  JSONL parser   │
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

- **Parser** читает per-turn usage fields (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) прямо из raw JSONL lines, которые создаёт Claude Code.
- **Pricing table** (`src/pricing.ts`) хранит per-million-token rates для Claude models, с `default` fallback, чтобы неизвестные модели всё равно возвращали summary вместо падения.
- **MCP server** предоставляет одиннадцать typed tools по stdio, покрывая локальные cost queries, per-tool/session analytics, anomaly detection, pre-run forecasting, budget caps и webhook alert configuration.
- **По умолчанию нет network egress.** Нет telemetry, нет API key, нет cloud sync. Единственная опциональная outbound surface, это `set_monitor_webhook`, явная opt-in настройка для доставки alerts.

## Сравнение с альтернативами

Эти инструменты пересекаются, но отвечают на разные вопросы. Короткая версия: если вам нужен local MCP-first Cost Guard, который агент может вызывать напрямую для session forensics, per-tool attribution, forecasts, anomalies и guardrails, то `@vk0/agent-cost-mcp` подходит узко и точно. Если же вам прежде всего нужен dashboard, native quick check или общий burn monitor, одна из альтернатив может быть лучшей первой остановкой.

| Инструмент | Лучше подходит, когда... | Где альтернатива сильнее | Где сильнее `@vk0/agent-cost-mcp` |
|------|--------------------|---------------------------|------------------------------------------|
| [`ccusage`](https://github.com/ryoppippi/ccusage) | Нужен polished terminal/TUI dashboard для Claude Code usage и burn tracking. | Более зрелый human-facing dashboard experience и более сильный operator-style monitoring UX. | MCP-first доступ для агентов, более глубокие per-tool/session forensics и Cost Guard answers прямо в разговоре, а не в отдельном dashboard. |
| **claude-usage** | Нужны лёгкие usage summaries или быстрый reporting по usage data, без сложной agent-facing intervention logic. | Проще reporting-first framing и более лёгкие usage snapshots. | Полезнее, когда следующий вопрос, это какой tool, branch или retry loop вызвал spend и должен ли агент остановиться или изменить поведение. |
| **Claude-Code-Usage-Monitor** | Нужен в первую очередь monitor-style обзор usage patterns. | Лучше подходит, если пассивный monitoring, это основная работа, а detailed local forensics вторичны. | Сильнее в local guardrails, subagent attribution, anomaly detection и actionable follow-up внутри MCP loop. |
| [`Token Analyzer MCP`](https://github.com/proggreg/mcp-token-analyzer) | Нужен более общий MCP token-analysis utility для payloads, prompts или message shapes. | Более широкий token-analysis framing, не так жёстко привязанный к логам Claude Code. | Более специфичен для реального Claude Code JSONL spend analysis, pricing-aware cost math и session-oriented Cost Guard workflows. |
| [`CodeBurn`](https://github.com/getagentseal/codeburn) | Важнее burn-rate или usage monitoring и alerts, чем offline session forensics. | Сильнее, когда главный вопрос, это «не сжигаю ли я слишком быстро?», а не «какая ветка, tool или retry loop это вызвали?». | Лучше для local Cost Guard workflows, tool attribution, branch/subagent breakdowns и детального post-run cost debugging без cloud dependence. |

Несколько честных caveats:

- built-in `/cost` или `/usage` всё ещё лучший ответ, если нужен просто быстрый native number
- `ccusage`, `claude-usage` или Claude-Code-Usage-Monitor могут быть лучше, если ваш главный приоритет, это reporting-first или monitor-first experience
- CodeBurn может лучше подойти, если burn-rate monitoring важнее, чем детальная local cost debugging
- `@vk0/agent-cost-mcp` намеренно уже по scope: локальные Claude Code JSONL logs, pricing-aware cost analysis, MCP-callable outputs и guardrail-style answers внутри agent loop

**Best fit:** solo developers и маленькие команды, которым нужен агент, способный ответить: «куда ушли токены, какой tool или branch это вызвали, насколько рискован текущий паттерн и что стоит поменять?» без отправки логов в облако и без отдельного billing dashboard.

## FAQ

<details>
<summary><strong>Куда-нибудь отправляются данные?</strong></summary>

Нет. Всё работает локально. Сервер парсит JSONL-файлы в `~/.claude/projects/`, считает всё в Node и возвращает JSON в MCP-клиент. Нет ни telemetry, ни analytics endpoint, ни cloud sync. Можно запускать даже с отключённой сетью.
</details>

<details>
<summary><strong>Насколько точна оценка стоимости?</strong></summary>

Оценки укладываются примерно в ~5% относительно встроенного `/cost` Claude Code на наших dogfood-сессиях. Точный delta зависит от pricing table в `src/pricing.ts` и от того, насколько полны usage fields в ваших JSONL. Это **не** billing source of truth, перед бизнес-решениями всегда сверяйтесь с реальным Anthropic invoice.
</details>

<details>
<summary><strong>Работает ли это с Cursor, Cline или Continue?</strong></summary>

Пока нет. Сейчас parser ориентирован на JSONL session log format Claude Code (`~/.claude/projects/**/*.jsonl`). Cursor, Cline и Continue пишут логи в других местах и форматах. PRs welcome, откройте issue с примером формы лога.
</details>

<details>
<summary><strong>Нужен ли API-ключ?</strong></summary>

Нет. Ни Anthropic API key, ни npm token, ни вообще какая-либо аутентификация. Сервер работает только с вашей локальной файловой системой.
</details>

<details>
<summary><strong>Почему MCP, а не CLI?</strong></summary>

Поддерживаются оба варианта. У пакета есть `bin` entry (`agent-cost-mcp <session.jsonl>`) для разового анализа из терминала. Но MCP server, это главный surface: когда AI-агент может вызывать инструменты напрямую, cost insight приходит *внутрь разговора*, где траты и происходят.
</details>

<details>
<summary><strong>Цены изменились. Таблица обновляется автоматически?</strong></summary>

Нет, и это сделано специально. `src/pricing.ts`, это обычный TypeScript module: predictable, auditable, forkable. Когда Anthropic публикует новые rates, обновите константы и перезапустите. Auto-update означал бы network egress, а это конфликтует с local-first принципом.
</details>

<details>
<summary><strong>MCP-сервер не появляется в клиенте. Что проверить?</strong></summary>

1. **Полностью перезапустите клиент** после правки конфигурации.
2. **Запустите вручную:** `npx -y @vk0/agent-cost-mcp`, вы должны увидеть, что MCP server стартовал и ждёт stdio (Ctrl+C для выхода). Если есть ошибка, проблема в установке.
3. **Проверьте логи Claude Desktop:** `~/Library/Logs/Claude/mcp*.log` (macOS) или `%APPDATA%\Claude\logs\mcp*.log` (Windows).
4. **Проверьте Node ≥18:** `node --version`. Пакет требует Node 18+.
</details>

## Ограничения

- **Это оценки, а не биллинг.** Стоимость вычисляется из per-turn usage fields × локальная pricing table. Это не замена реальному Anthropic invoice.
- **Pricing table обновляется вручную.** `src/pricing.ts` нужно менять при изменении тарифов, специально без тихих network calls.
- **Только Claude Code.** Сессии Cursor/Cline/Continue не парсятся. Поддержка других клиентов может появиться, если будет спрос.
- **Локальное чтение файлов.** Сервер читает файлы из project path, который вы ему передаёте. Он не запрашивает live runtime state Claude Code.
- **Structured JSON output.** Нет rich dashboards, charts или web UI. Это feature, а не bug: MCP client и есть UI.
- **Cache-read awareness зависит от источника.** Если в JSONL нет cache-read/cache-creation token fields, эти компоненты будут показаны как нули.

## Standalone CLI

Тот же parser доступен и как CLI для разового анализа без MCP-клиента:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --watch --watch-interval 5
```

`--watch` продолжает пересканировать целевой session log по интервалу и печатает обновлённую компактную summary. Это удобно, когда активная coding session всё ещё накапливает стоимость.

Возвращается тот же JSON, что и у MCP-инструмента `get_session_cost`.

## Разработка

Склонируйте репозиторий и запустите:

```bash
npm ci           # установить зависимости
npm run build    # скомпилировать в dist/
npm test         # unit tests vitest
npm run lint     # tsc --noEmit
npm run smoke    # end-to-end MCP client smoke test
```

Стек: TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest.

### Recovery path для Official MCP Registry

Если npm/package metadata уже корректны, но Official MCP Registry listing требует bounded re-publish, запускайте dedicated GitHub Actions workflow вместо нового тега или повторного полного release flow:

```bash
gh workflow run registry-republish.yml --repo vk0dev/agent-cost-mcp
```

Этот workflow перепубликует только `server.json` в Official MCP Registry через GitHub OIDC. Он не публикует пакет в npm и не создаёт новый release.

## Changelog

См. [CHANGELOG.md](./CHANGELOG.md). Проект следует [semantic versioning](https://semver.org) начиная с v1.0.0.

## Вклад

Issues и PR приветствуются в [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp). Для новых записей в pricing table, изменений log format или поддержки других клиентов, пожалуйста, сначала откройте issue с sample fixture.

## Лицензия

[MIT](./LICENSE) © vk0.dev
