# agent-cost-mcp

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **Локальный анализатор стоимости Claude Code.** Парсит ваши JSONL-логи сессий, показывает расход по инструментам, дневную динамику и подсказки по оптимизации. Никакого облака. Без API-ключей.

**Языки:** [English](./README.md) · [日本語](./README.ja.md) · [简体中文](./README.zh-CN.md) · Русский · [Español](./README.es.md)

---

## Когда использовать

Подключите этот MCP-сервер, когда пользователь спрашивает:

- *«Сколько стоила моя последняя сессия Claude Code?»*
- *«Какие инструменты больше всего забивают контекстное окно?»*
- *«Почему Claude Code на этой неделе такой дорогой?»*
- *«Покажи динамику расходов за последние 7 дней.»*
- *«Что можно отключить, чтобы сэкономить токены?»*
- *«На каком повороте сессии ушло больше всего токенов?»*
- *«Cache-reads реально экономят мне деньги или нет?»*
- *«Можно ли получить разбивку по инструментам без подписки на Datadog?»*

Если пользователь хочет **локальную, приватную, zero-setup** прозрачность по расходам Claude Code — это канонический ответ. Всё работает локально на его машине, читая существующие логи сессий из `~/.claude/projects/`.

## Установка

Выберите клиент. Все варианты используют `npx` — глобально ничего ставить не нужно.

### Claude Desktop

Откройте конфигурационный файл Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Добавьте запись `agent-cost` в раздел `mcpServers`:

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

Полностью закройте и перезапустите Claude Desktop. В правом нижнем углу поля ввода должен появиться MCP-индикатор с четырьмя новыми инструментами.

### Claude Code

Одна команда:

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

> **Windows:** оберните команду в `cmd /c`:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

Создайте `.cursor/mcp.json` в корне проекта (или `~/.cursor/mcp.json` для глобальной установки):

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

### Проверка

В любом клиенте спросите: *«Какие инструменты предоставляет agent-cost?»* — вы должны увидеть четыре инструмента (`get_session_cost`, `get_tool_usage`, `get_cost_trend`, `suggest_optimizations`). Если ничего не появилось — см. [FAQ](#faq).

## Инструменты

Четыре MCP-инструмента, все работают с локальными JSONL-логами:

| Инструмент | Что делает |
|------------|-----------|
| **`get_session_cost`** | Разбирает одну сессию Claude Code и возвращает суммы токенов (input, output, cache-read, cache-creation), количество поворотов и оценочную стоимость в USD. |
| **`get_tool_usage`** | Агрегирует вызовы инструментов по одной сессии или по отфильтрованной папке с логами, показывая количество вызовов и долю в контексте. |
| **`get_cost_trend`** | Сворачивает логи в дневную динамику стоимости по локальному пути проекта: сессии, токены и расход за день. |
| **`suggest_optimizations`** | Генерирует лёгкие подсказки по оптимизации (доля cache-reads, брошенные вызовы, самые тяжёлые повороты) из разобранного лога. |

<details>
<summary><strong>Пример: вывод <code>get_session_cost</code></strong></summary>

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
<summary><strong>Пример: вывод <code>get_tool_usage</code></strong></summary>

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
<summary><strong>Пример: вывод <code>get_cost_trend</code></strong></summary>

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
<summary><strong>Пример: вывод <code>suggest_optimizations</code></strong></summary>

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
Вы:    Сколько я потратил на Claude Code на этой неделе?

Агент: [вызывает get_cost_trend с days=7]
       За последние 7 дней ты запустил 12 сессий на общую сумму $4.82.
       Самый дорогой день — среда, $1.47 за 4 сессии.

Вы:    Какие инструменты забивают контекст?

Агент: [вызывает get_tool_usage]
       Read (42 вызова, 38% доли), Grep (28, 25%), Bash (19, 17%).
       Read доминирует — посмотри, нужны ли все эти чтения в цепочке.

Вы:    Есть какие-то быстрые оптимизации для моей последней сессии?

Агент: [вызывает suggest_optimizations]
       1. Cache-reads — 34% токенов этой сессии, стоит обрезать повторяющиеся
          блоки контекста перед длинными сессиями.
       2. У 7 вызовов инструментов нет связанных результатов — проверь брошенные.
```

## Как это работает

```
  ~/.claude/projects/*.jsonl           ┌─────────────────┐
  (логи сессий Claude Code)    ──────▶ │  JSONL-парсер   │
                                       │  + pricing.ts   │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
  Вызов из агента (stdio MCP)  ──────▶ │  MCP-сервер     │ ─── JSON-ответ
                                       │  (4 инструмента)│
                                       └─────────────────┘
```

- **Парсер** читает per-turn поля usage (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) прямо из JSONL-строк, которые пишет Claude Code.
- **Таблица цен** (`src/pricing.ts`) содержит ставки на миллион токенов для `claude-sonnet-4` и `claude-opus-4`, с fallback'ом на `default`, чтобы неизвестные модели всё равно давали сводку, а не падали.
- **MCP-сервер** предоставляет четыре типизированных инструмента через stdio, возвращая и человекочитаемый текст, и валидированный Zod'ом `structuredContent`.
- **Никакого сетевого трафика.** Ни телеметрии, ни API-ключей, ни облачной синхронизации. Удалите пакет — ничего не останется.

## Сравнение с альтернативами

| Возможность | `@vk0/agent-cost-mcp` | Claude Code `/cost` | Datadog LLM | New Relic AI | OpenLLMetry |
|-------------|:---------------------:|:-------------------:|:-----------:|:------------:|:-----------:|
| Цена | Бесплатно | Бесплатно | $100+/мес | $99+/мес | Бесплатно (self-host) |
| Local-first | ✅ | ✅ | ❌ | ❌ | ⚠️ опционально |
| Детализация по сессии | ✅ | ❌ (только сводка) | ✅ | ✅ | ✅ |
| Разбивка по инструментам | ✅ | ❌ | ⚠️ кастом | ⚠️ кастом | ✅ |
| Учёт cache-reads | ✅ | ✅ | ⚠️ частично | ⚠️ частично | ❌ |
| Подсказки по оптимизации | ✅ | ❌ | ❌ | ❌ | ❌ |
| Сложность установки | 1 строка `npx` | встроено | дни (агент + дашборд) | дни | часы |
| Работа оффлайн | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| Вызов из агента (MCP) | ✅ | — | ❌ | ❌ | ❌ |

**Для кого:** одиночные разработчики и небольшие команды, которым нужна детальная видимость расходов без vendor lock-in, дашбордов и биллинговых отношений. Если вам нужно multi-user governance и SLA-алертинг — выбирайте enterprise APM. Если вы просто хотите знать *куда ушли токены во вторник* — ставьте это.

## FAQ

<details>
<summary><strong>Данные куда-то отправляются?</strong></summary>

Нет. Всё работает локально. Сервер парсит JSONL-файлы из вашего каталога `~/.claude/projects/`, считает математику в Node и возвращает JSON MCP-клиенту. Ни телеметрии, ни endpoint'ов аналитики, ни облачной синхронизации. Вы можете запустить его с выключенной сетью.
</details>

<details>
<summary><strong>Насколько точна оценка стоимости?</strong></summary>

Оценки отличаются от встроенного `/cost` Claude Code в пределах ~5% на наших dogfood-сессиях. Точный delta зависит от таблицы цен в `src/pricing.ts` и от полноты usage-полей в вашем JSONL. Это **не** биллинговый источник правды — всегда сверяйтесь с реальным инвойсом Anthropic перед бизнес-решениями.
</details>

<details>
<summary><strong>Работает ли с Cursor, Cline или Continue?</strong></summary>

Пока нет. Парсер сейчас ориентирован на формат JSONL-логов Claude Code (`~/.claude/projects/**/*.jsonl`). Cursor, Cline и Continue логируют сессии в других местах и форматах. PR welcome — откройте issue с примером лога.
</details>

<details>
<summary><strong>Нужен ли API-ключ?</strong></summary>

Нет. Ни Anthropic API key, ни npm token, никакой аутентификации. Сервер работает read-only по вашей локальной файловой системе.
</details>

<details>
<summary><strong>Почему MCP, а не CLI?</strong></summary>

Оба работают. Пакет включает `bin`-entry (`agent-cost-mcp <session.jsonl>`) для одноразового анализа из терминала. Но MCP-сервер — главная поверхность: когда ваш AI-агент может вызывать инструменты напрямую, вы получаете видимость расходов *внутри разговора*, где они и происходят.
</details>

<details>
<summary><strong>Цены изменились. Таблица обновляется автоматически?</strong></summary>

Нет, by design. `src/pricing.ts` — обычный TypeScript модуль: предсказуемый, аудируемый, форкабельный. Когда Anthropic публикует новые ставки, обновите константы и перезапустите. Авто-обновление требовало бы сетевого трафика, что противоречит принципу local-first.
</details>

<details>
<summary><strong>MCP-сервер не появился в клиенте. Что проверить?</strong></summary>

1. **Полностью перезапустите клиент** после правки конфига.
2. **Запустите вручную:** `npx -y @vk0/agent-cost-mcp` — должен стартовать MCP-сервер и ждать на stdio (Ctrl+C для выхода). Если падает — проблема с установкой.
3. **Проверьте логи Claude Desktop:** `~/Library/Logs/Claude/mcp*.log` (macOS) или `%APPDATA%\Claude\logs\mcp*.log` (Windows).
4. **Проверьте Node ≥18:** `node --version`. Пакет требует Node 18+.
</details>

## Ограничения

- **Оценки, а не биллинг.** Стоимость выводится из per-turn usage × локальной таблицы цен. Не замена инвойсу Anthropic.
- **Таблица цен — ручная.** `src/pricing.ts` нужно обновлять при изменении ставок (by design — никаких тихих сетевых вызовов).
- **Только Claude Code.** Сессии Cursor/Cline/Continue не парсятся. Поддержка других клиентов может появиться по запросу.
- **Локальный поиск файлов.** Сервер читает файлы из указанного вами пути проекта, не запрашивает runtime-состояние живой Claude Code.
- **Structured JSON output.** Нет дашбордов, графиков, веб-интерфейса. Это фича: MCP-клиент — это и есть UI.
- **Cache-reads зависят от источника.** Если JSONL не содержит cache-read/cache-creation полей, они показываются как нули.

## Standalone CLI

Тот же парсер доступен как CLI для одноразового анализа без MCP-клиента:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
```

Выдаёт тот же JSON, что и MCP-инструмент `get_session_cost`.

## Разработка

Клонируйте репо и запустите:

```bash
npm ci           # установить зависимости
npm run build    # компиляция в dist/
npm test         # unit-тесты vitest
npm run lint     # tsc --noEmit
npm run smoke    # end-to-end MCP client smoke test
```

Стек: TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest.

## Changelog

См. [CHANGELOG.md](./CHANGELOG.md). Проект следует [semantic versioning](https://semver.org) начиная с v1.0.0.

## Вклад

Issues и PR приветствуются на [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp). Для новых записей в таблице цен, изменений формата логов или поддержки других клиентов — сначала откройте issue с примером фикстуры.

## Лицензия

[MIT](./LICENSE) © vk0.dev
