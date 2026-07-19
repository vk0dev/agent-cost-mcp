# agent-cost-mcp

Cost Guard local y runtime guardrails para agentes de IA en Claude Code.

La superficie actual de la release v2.3.3 sigue siendo local-first y está centrada en una sola misión orientada al operador: mostrar de dónde viene el gasto, hacia dónde se dirige, atribuir coste por provider/model/tool, resumir árboles de subagentes con `subtreeCost` y permitir signed monitor-webhook alerts sin introducir un hosted control plane.

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **Cost Guard para Claude Code.** `@vk0/agent-cost-mcp` lee tus logs JSONL locales de sesiones y responde a la pregunta que viene después de `/cost`: qué tool, branch, retry loop o runaway pattern está quemando tokens de verdad, y qué deberías cambiar a continuación. En `2.3.3`, los baselines agregados de tendencia diaria y anomalías quedan anclados a assistant-row timestamps, así que los días recientes dentro de archivos JSONL multiday más antiguos ya no desaparecen de la vista local del operador. Cero nube. Sin API key.

**Idiomas:** [English](./README.md) · [日本語](./README.ja.md) · [简体中文](./README.zh-CN.md) · [Русский](./README.ru.md) · Español

> Estado de listings: npm sigue siendo el canonical install path, Smithery y mcp.so ya están verificados como live, pero este README todavía no trata Glama como verified listing.

<a href="https://vk0dev.github.io/agent-cost-mcp"><img src="./docs/demo-cost-guard.gif" alt="agent-cost-mcp Cost Guard demo: anomaly trigger fires, low-ROI retry loop is flagged, and the agent stops at the hard budget cap" width="787"></a>

---

## Por qué y cuándo usarlo

Úsalo cuando **Claude Code ya te dio un número de coste, pero no la razón que lo explica**.

**Para visibilidad rápida usa native `/cost`, ccusage o cctally** — totales, statusline, uso diario y dashboards de subscription-quota. Acude a `@vk0/agent-cost-mcp` cuando la siguiente pregunta sea *qué tool, subagent o branch quemó el presupuesto, qué ocurrirá si el run continúa y qué debería hacer el agente a continuación* — respondido localmente desde JSONL, en formato legible por máquina.

Casos típicos de Cost Guard:

- **Sesiones tool-heavy:** identificar qué herramientas dominan el cost share, el context share y los patrones low-ROI en una ejecución o en muchas.
- **Retry loops y runaway behavior:** detectar repeated turns, abandoned tool calls, anomaly days o branch-level burn patterns antes de que se acumulen en silencio. En `2.3.3`, los baselines de tendencia diaria y anomalías quedan atados a assistant-row timestamps, así que la actividad reciente dentro de JSONL multiday más antiguos es menos propensa a desaparecer de la vista del operador.
- **Pre-spend guardrails:** estimar el coste probable de un run, fijar budget thresholds y emitir monitor alerts antes de que otro agent run largo se salga de control.

Si el usuario quiere **cost forensics y guardrails locales, privacy-preserving y zero-setup** para sesiones de Claude Code, esta es la respuesta canónica. Todo corre en su máquina sobre los logs existentes en `~/.claude/projects/`.

**Dónde guarda Claude Code los session logs:** mira `~/.claude/projects/<project>/` para encontrar los archivos `.jsonl` de cada sesión, por ejemplo `~/.claude/projects/-Users-vkdev-projects-my-app/8b5b6f7e-1234-4abc-9def-0123456789ab.jsonl`. Si tu cliente ya conoce el session path exacto, pásalo directamente; si no, apunta Agent Cost MCP a la carpeta del proyecto correspondiente y revisa allí los JSONL recientes.

## No es para esto

Esto **no** es un billing dashboard, procurement console, org-finance system ni invoice source of truth.

Está pensado para developers y operators que quieren respuestas estilo Cost Guard desde logs locales de Claude Code, no para chargeback reporting, company-wide spend accounting ni live runtime introspection.

## Instalación

Elige tu cliente. Todas las opciones usan `npx`, así que no hay nada que instalar globalmente.

### Claude Desktop

Edita el archivo de configuración de Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Añade la entrada `agent-cost` dentro de `mcpServers`:

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

Cierra Claude Desktop por completo y reinícialo. El indicador MCP en la esquina inferior derecha del cuadro de chat debería mostrar once herramientas nuevas.

### Claude Code

One-liner con el CLI:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

O añade un server con alcance de proyecto en `.mcp.json` en la raíz:

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

> **Usuarios de Windows:** envuelve el comando con `cmd /c`:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

Crea `.cursor/mcp.json` en la raíz del proyecto, o `~/.cursor/mcp.json` para una instalación global:

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

Abre la configuración MCP de Cline (icono MCP Servers → **Configure**) y añade:

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

### Verifica que funciona

En cualquier cliente, pregunta: *«¿Qué herramientas expone agent-cost?»* Deberías ver once herramientas agrupadas más o menos así:

- cost queries: `get_session_cost`, `get_tool_usage`, `get_cost_trend`, `get_subagent_tree`
- optimization analytics: `get_tool_roi`, `suggest_optimizations`, `detect_cost_anomalies`
- predictive: `get_cost_forecast`, `estimate_run_cost`
- configuration: `configure_budget`, `set_monitor_webhook`

Si no aparece nada, consulta el [FAQ](#faq).

## Marketplace / Discovery

Superficies de discovery verificadas actualmente:

- **npm:** canonical install path vía `npx -y @vk0/agent-cost-mcp`
- **MCP Registry:** package metadata e identidad de cara al registry
- **Smithery:** listing third-party verificado en `https://smithery.ai/servers/unfucker/agent-cost-mcp`
- **mcp.so:** product page verificada en `https://mcp.so/server/agent-cost-mcp/vk0dev`

Glama debe tratarse como no verificado por ahora hasta reconfirmar su stable product-page URL.

La calidad del metadata puede variar entre superficies de discovery, pero Smithery y mcp.so tienen presencia live verificada para este paquete.

Si estás descubriendo este paquete por primera vez, el preferred path hoy es npm para instalar y Smithery o mcp.so para marketplace-style browsing.

## Visibilidad rápida (native `/cost`, ccusage, cctally) vs Cost Guard forensics (`@vk0/agent-cost-mcp`)

Claude Code, ccusage y cctally ya ofrecen visibilidad de coste útil. `@vk0/agent-cost-mcp` está pensado para la capa siguiente: forensics, attribution y guardrails.

### Usa native `/cost`, ccusage o cctally cuando

- quieres el total de la sesión actual o el número de statusline rápidamente
- necesitas dashboards de uso diario/por período o resúmenes de burn-rate
- quieres quota forecasts de subscription Pro/Max, cost-per-percent trends o threshold alerts (cctally)
- buscas una UX de monitorización pulida orientada a humanos
- no quieres configurar nada

### Usa `@vk0/agent-cost-mcp` cuando

- quieres la cuota de coste por herramienta y el ranking ROI con `get_tool_roi` y `get_tool_usage`
- necesitas attribution de coste parent↔subagent entre branches con `get_subagent_tree`
- quieres detección de anomalías respecto a tu baseline local con `detect_cost_anomalies`
- necesitas estimaciones de gasto futuro con `get_cost_forecast` o `estimate_run_cost`
- quieres budget caps legibles por el agente y guardrails de parada dura con `configure_budget`
- necesitas sugerencias de next-action legibles por máquina y alertas webhook firmadas con `suggest_optimizations` y `set_monitor_webhook`

### Mejor juntos

Usa native `/cost`, ccusage o cctally para la visibilidad rápida; acude a `@vk0/agent-cost-mcp` cuando la siguiente pregunta sea: *qué tool, subagent o branch quemó el presupuesto, qué ocurrirá si el run continúa y qué debería hacer el agente?* — respondido localmente desde JSONL, en formato legible por máquina.

Este paquete **no** reemplaza invoices, org-wide billing systems ni live runtime introspection. Es una superficie MCP local para structured cost forensics y guardrails sobre logs de sesión de Claude Code.

## Docs y guías how-to

Si quieres flujos de operador concretos en vez del reference completo, empieza aquí:

- Si quieres recipes rápidas para setup, forecast y budget-cap workflows, mira [docs/README.md](./docs/README.md)
- Nota de release actual: en `2.3.3`, los aggregated daily trend y anomaly baselines siguen atados a assistant-row timestamps, así que los días más nuevos dentro de JSONL multiday más antiguos siguen visibles.
- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

Demo assets ya shipped que puedes revisar rápido:

- [Forecast / cap-hit demo GIF](./docs/demo-forecast.gif) para el operator story actual de `get_cost_forecast`
- [Subagent-tree cost demo GIF](./docs/demo-subagent-tree.gif) para el branch-cost story actual de `get_subagent_tree`

## Herramientas

Once herramientas MCP, todas operando sobre logs JSONL locales y todas enfocadas en una sola pregunta de Cost Guard: dónde se está acumulando el gasto, qué tan riesgoso es el patrón actual y qué debería cambiar el operator o el agente a continuación.

**Cost queries (read-only):**

| Tool | Qué hace |
|------|-------------|
| **`get_session_cost`** | Analiza una sola sesión de Claude Code y devuelve totales de tokens, número de turns, uso de cache y coste estimado en USD, para que toda pregunta posterior de Cost Guard arranque desde un run summary concreto. |
| **`get_tool_usage`** | Agrega tool invocations de una sesión o de un directorio filtrado de logs del proyecto, informando per-tool call counts y context-share percentages para ver qué patrones de tools están moviendo el spend de verdad. |
| **`get_cost_trend`** | Convierte logs de sesiones en una tendencia local day-by-day de coste, con per-day sessions, tokens y estimated spend, para que anomalies y burn ascendente sean visibles antes de convertirse en intuición vaga. |
| **`get_subagent_tree`** | Devuelve un árbol parent-plus-subagent de un run local de Claude Code, sumando coste por branch, para que veas qué branch o delegated path consumió realmente el presupuesto. |

![subagent tree demo](docs/demo-subagent-tree.gif)

**Optimization analytics:**

| Tool | Qué hace |
|------|-------------|
| **`get_tool_roi`** | Ordena tools usando una bounded ROI heuristic basada en cost share, linked results y context share, haciendo aflorar rápido llamadas repetidas con payoff débil como firma clásica de low-efficiency o runaway-loop. Después de `2.3.1`, la productive same-tool refinement tiene menos probabilidades de quedar marcada de forma demasiado agresiva. |
| **`suggest_optimizations`** | Genera optimization suggestions ligeras a partir de un session log parseado, incluyendo cache-read ratios, abandoned tool calls y los turns más pesados, cuando quieres un siguiente fix más concreto que una simple tabla de métricas. |
| **`detect_cost_anomalies`** | Marca daily cost spikes unusually high o low frente al baseline local reciente, para que sudden burn jumps, suspicious drops e unstable usage patterns destaquen sin necesitar un monitoring stack aparte. |

**Predictive (pre-spend):**

| Tool | Qué hace |
|------|-------------|
| **`get_cost_forecast`** | Proyecta una bounded local cost forecast a partir de recent daily trend data para responder hacia dónde va el spend, no solo dónde estuvo; `forecast_confidence` es una quartile-based local heuristic, no una certainty, y degrada de forma graceful cuando todavía hay poca historia. |

![forecast demo: get_cost_forecast showing recency-weighted-average-rc2 local spend projection](docs/demo-forecast.gif)

![forecast fallback demo: sparse-history fallback lowers spike-driven overprojection and adds confidence metadata](docs/demo-forecast-fallback.gif)
| **`estimate_run_cost`** | Estima el coste probable de un planned run antes de ejecutarlo, a partir del prompt, el model y la expected tool-call shape, devolviendo `{low, expected, high}` con confidence para decisiones pre-spend. |

**Configuration (write):**

| Tool | Qué hace |
|------|-------------|
| **`configure_budget`** | Configura budget caps diarios o por sesión con tiered alert thresholds, para que el siguiente cost-query tool pueda devolver un machine-readable warning antes de que un agente cruce en silencio un soft o hard spending boundary. |

![budget cap demo](docs/demo-budget-cap.gif)
| **`set_monitor_webhook`** | Registra un webhook target firmado con HMAC para anomaly alerts, cruces de budget thresholds y runaway flags, de modo que las señales de Cost Guard puedan salir de la sesión local y llegar a un workflow operativo cuando haga falta. |

<details>
<summary><strong>Ejemplo de salida de <code>get_session_cost</code></strong></summary>

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
<summary><strong>Ejemplo de salida de <code>get_tool_usage</code></strong></summary>

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
<summary><strong>Ejemplo de salida de <code>get_cost_trend</code></strong></summary>

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
<summary><strong>Ejemplo de salida de <code>suggest_optimizations</code></strong></summary>

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

## Ejemplo de conversación

```
Tú:     ¿Cuánto gasté en Claude Code esta semana?

Agente: [llama a get_cost_trend con days=7]
        En los últimos 7 días ejecutaste 12 sesiones por un total de $4.82.
        El día más caro fue el miércoles con $1.47 en 4 sesiones.

Tú:     ¿Qué tools están llenando mi contexto?

Agente: [llama a get_tool_usage]
        Read (42 llamadas, 38% share), Grep (28 llamadas, 25%), Bash (19 llamadas, 17%).
        Read domina, así que conviene revisar si todas esas lecturas de archivos siguen siendo necesarias
        dentro de la cadena de resultados.

Tú:     ¿Algún quick win para mi última sesión?

Agente: [llama a suggest_optimizations]
        1. Cache reads representan el 34% de esta sesión. Recortar bloques de contexto repetidos
           antes de sesiones largas suele ser la primera optimización más clara.
        2. 7 tool calls no tienen linked results. Revisa esas invocaciones abandonadas.
```

## Cómo funciona

```
  ~/.claude/projects/*.jsonl           ┌─────────────────┐
  (logs de sesión de Claude Code) ──▶  │  JSONL parser   │
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

- **El parser** lee los per-turn usage fields (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) directamente de las raw JSONL lines que produce Claude Code.
- **La pricing table** (`src/pricing.ts`) contiene per-million-token rates para Claude models, con fallback `default` para que los modelos desconocidos sigan devolviendo un summary en vez de fallar.
- **El MCP server** expone once typed tools sobre stdio, cubriendo local cost queries, per-tool/session analytics, anomaly detection, pre-run forecasting, budget caps y webhook alert configuration.
- **No hay network egress por defecto.** No hay telemetry, no hay API key, no hay cloud sync. La única outbound surface opcional es `set_monitor_webhook`, una configuración opt-in explícita para entregar alerts.

## Comparación frente a alternativas

Estas herramientas se solapan, pero optimizan preguntas distintas. La versión corta: si quieres un local MCP-first Cost Guard que un agente pueda consultar directamente para session forensics, per-tool attribution, forecasts, anomalies y guardrails, `@vk0/agent-cost-mcp` encaja de forma estrecha y precisa. Si tu prioridad principal es un dashboard, un native quick check o un burn monitor general, alguna alternativa puede ser mejor primera parada.

| Herramienta | Encaja mejor cuando... | Donde la alternativa es más fuerte | Donde `@vk0/agent-cost-mcp` es más fuerte |
|------|--------------------|---------------------------|------------------------------------------|
| [`ccusage`](https://github.com/ryoppippi/ccusage) | Quieres un polished terminal/TUI dashboard para Claude Code usage y burn tracking. | Experiencia dashboard más madura para humanos y mejor operator-style monitoring UX. | MCP-first access para agentes, per-tool/session forensics más ricos y respuestas Cost Guard dentro de la conversación, no en otro dashboard. |
| [`cctally`](https://github.com/omrikais/cctally) | Quieres un local dashboard para los límites de subscription Pro/Max de Claude Code — quota forecasts, cost-per-percent trends y threshold alerts en una vista ccusage-compatible. | Más enfocado en subscription-quota tracking con un dashboard/TUI human-facing. | MCP-callable, así que un agente puede obtener attribution por tool, subagent y branch, anomalies y guardrails dentro de la session en vez de leer un dashboard. |
| [`tokmon`](https://github.com/yagil/tokmon) | Quieres envolver un programa **OpenAI `gpt-*`** en ejecución y ver su token cost en tiempo real — tokmon no tiene soporte Claude/Anthropic, así que no puede monitorizar sesiones de Claude Code en absoluto. | Real-time cost monitoring haciendo proxy de las llamadas OpenAI API del programa mientras corre. | Funciona con Claude Code de fábrica, offline a partir del JSONL de Claude Code después del run, con per-tool/session forensics, pricing-aware math y guardrails MCP-callable en vez de live API proxying. |
| **claude-usage** | Quieres usage summaries ligeros o quick reporting y no necesitas mucha intervention logic orientada a agentes. | Framing reporting-first más simple y usage snapshots más ligeros. | Más útil cuando la siguiente pregunta es qué tool, branch o retry loop causó el spend y si el agente debería detenerse o ajustar su comportamiento. |
| **Claude-Code-Usage-Monitor** | Tu prioridad es monitor-style visibility sobre usage patterns. | Mejor si el trabajo principal es el passive monitoring y los detailed local forensics son secundarios. | Más fuerte para local guardrails, subagent attribution, anomaly detection y actionable follow-up dentro del MCP loop. |
| [`Token Analyzer MCP`](https://github.com/proggreg/mcp-token-analyzer) | Necesitas un MCP token-analysis utility más general para payloads, prompts o message shapes. | Framing token-analysis más amplio, no tan atado a los logs de Claude Code. | Más específico para Claude Code JSONL spend analysis real, pricing-aware cost math y session-oriented Cost Guard workflows. |
| [`CodeBurn`](https://github.com/getagentseal/codeburn) | Te importa más burn-rate o usage monitoring y alerts que offline session forensics. | Más fuerte cuando la pregunta principal es “¿estoy quemando demasiado rápido?” en lugar de “¿qué branch, tool o retry loop lo causó?”. | Mejor para local Cost Guard workflows, tool attribution, branch/subagent breakdowns y detailed post-run cost debugging sin dependencia de la nube. |

Algunos caveats honestos:

- el built-in `/cost` o `/usage` sigue siendo la mejor respuesta si solo quieres un native number rápido;
- `ccusage`, `cctally`, `claude-usage` o Claude-Code-Usage-Monitor pueden encajar mejor si tu prioridad es una experiencia reporting-first, de dashboard o de subscription-quota;
- `CodeBurn` o `tokmon` pueden encajar mejor si el burn-rate monitoring en vivo o envolver un programa API en ejecución importa más que el detalle de local post-run cost debugging — ten en cuenta que `tokmon` solo soporta modelos OpenAI `gpt-*` y no tiene soporte Claude Code ni Anthropic;
- `@vk0/agent-cost-mcp` es deliberadamente más estrecho: logs JSONL locales de Claude Code, pricing-aware cost analysis, MCP-callable outputs y respuestas guardrail-style dentro del agent loop.

**Best fit:** solo developers y equipos pequeños que quieren que un agente responda *dónde se fueron mis tokens, qué tool o branch lo causó, si este patrón es riesgoso y qué debería cambiar* sin enviar logs a la nube ni abrir un billing dashboard aparte.

## FAQ

<details>
<summary><strong>¿Envía datos a algún sitio?</strong></summary>

No. Todo funciona localmente. El server analiza JSONL files de tu directorio `~/.claude/projects/`, hace la matemática en Node y devuelve JSON al MCP client. No hay telemetry, no hay analytics endpoint, no hay cloud sync. Puedes ejecutarlo incluso con la red desactivada.
</details>

<details>
<summary><strong>¿Qué tan preciso es el cálculo de coste?</strong></summary>

En nuestras dogfood sessions, las estimaciones quedan dentro de ~5% respecto al `/cost` built-in de Claude Code. El delta exacto depende de la pricing table en `src/pricing.ts` y de cuán completos sean los usage fields de tu JSONL. **No** es una billing source of truth, así que siempre reconcílialo con tu Anthropic invoice real antes de tomar decisiones de negocio.
</details>

<details>
<summary><strong>¿Funciona con sesiones de Cursor, Cline o Continue?</strong></summary>

Todavía no. El parser actual apunta al JSONL session log format de Claude Code (`~/.claude/projects/**/*.jsonl`). Cursor, Cline y Continue registran sesiones en otros lugares y formatos. PRs bienvenidos, abre un issue con una muestra del log.
</details>

<details>
<summary><strong>¿Necesita una API key?</strong></summary>

No. Ni Anthropic API key, ni npm token, ni ningún tipo de autenticación. El server solo lee tu sistema de archivos local.
</details>

<details>
<summary><strong>¿Por qué MCP en vez de CLI?</strong></summary>

Ambos están soportados. El paquete incluye un `bin` entry (`agent-cost-mcp <session.jsonl>`) para análisis puntuales desde terminal. Pero el MCP server es la superficie principal: cuando tu agente de IA puede llamar a las tools directamente, obtienes cost insight *dentro de la conversación* donde ocurre el gasto.
</details>

<details>
<summary><strong>Los precios cambiaron. ¿La tabla se actualiza automáticamente?</strong></summary>

No, por diseño. `src/pricing.ts` es un plain TypeScript module: predictable, auditable y forkable. Cuando Anthropic publique nuevas rates, actualiza las constants y vuelve a ejecutar. La auto-actualización implicaría network egress, lo cual contradice el principio local-first.
</details>

<details>
<summary><strong>El MCP server no aparece en mi cliente. ¿Qué reviso?</strong></summary>

1. **Reinicia el cliente por completo** después de editar la configuración.
2. **Ejecútalo manualmente:** `npx -y @vk0/agent-cost-mcp`. Deberías ver un MCP server arrancar y esperar por stdio (Ctrl+C para salir). Si falla, tienes un problema de instalación.
3. **Revisa los Claude Desktop logs:** `~/Library/Logs/Claude/mcp*.log` (macOS) o `%APPDATA%\Claude\logs\mcp*.log` (Windows).
4. **Verifica Node ≥18:** `node --version`. El paquete requiere Node 18+.
</details>

## Limitaciones

- **Son estimaciones, no facturación.** El coste se deriva de per-turn usage fields × una pricing table local. No sustituye tu Anthropic invoice.
- **La pricing table es manual.** `src/pricing.ts` debe actualizarse cuando cambien las tarifas, por diseño y sin silent network calls.
- **Solo Claude Code.** No analiza sesiones de Cursor/Cline/Continue. Podrían añadirse otros clients si hay demanda.
- **Lectura local de archivos.** El server lee files de la project path que le pases. No consulta el live runtime state de Claude Code.
- **Structured JSON output.** No hay rich dashboards, charts ni web UI. Es una feature, no un bug: el MCP client es la UI.
- **La cache-read awareness depende del origen.** Si los JSONL no incluyen cache-read/cache-creation token fields, esos componentes se reportan como cero.

## Standalone CLI

El mismo parser también está disponible como CLI para análisis puntuales sin un MCP client:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --watch --watch-interval 5
```

`--watch` vuelve a escanear el session log objetivo en un intervalo y va imprimiendo el compact summary actualizado. Es útil mientras una active coding session sigue acumulando coste.

Devuelve el mismo JSON que la tool MCP `get_session_cost`.

## Desarrollo

Clona el repo y ejecuta:

```bash
npm ci           # instalar dependencias
npm run build    # compilar a dist/
npm test         # vitest unit tests
npm run lint     # tsc --noEmit
npm run smoke    # end-to-end MCP client smoke test
```

Stack: TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest.

### Recovery path del Official MCP Registry

Si npm/package metadata ya son correctos pero el Official MCP Registry listing necesita un bounded re-publish, dispara el workflow dedicado de GitHub Actions en vez de crear un nuevo tag o relanzar el release flow completo:

```bash
gh workflow run registry-republish.yml --repo vk0dev/agent-cost-mcp
```

Este workflow vuelve a publicar solo `server.json` al Official MCP Registry vía GitHub OIDC. No publica a npm ni crea una nueva release.

## Changelog

Consulta [CHANGELOG.md](./CHANGELOG.md). Este proyecto sigue [semantic versioning](https://semver.org) desde v1.0.0.

## Contribuir

Issues y PRs bienvenidos en [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp). Para nuevas entradas en la pricing table, cambios de log format o soporte para otros clients, abre primero un issue con un sample fixture.

## Licencia

[MIT](./LICENSE) © vk0.dev
