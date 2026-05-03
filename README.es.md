# agent-cost-mcp

[![npm version](https://img.shields.io/npm/v/@vk0/agent-cost-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@vk0/agent-cost-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-6633cc.svg?style=flat-square)](https://github.com/modelcontextprotocol/registry)
[![CI](https://img.shields.io/github/actions/workflow/status/vk0dev/agent-cost-mcp/ci.yml?branch=main&style=flat-square)](https://github.com/vk0dev/agent-cost-mcp/actions)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?style=flat-square)](https://nodejs.org)

> **Analizador local de costes de Claude Code.** Lee tus logs JSONL de sesiones y muestra gasto por herramienta, tendencia diaria y sugerencias de optimización. Sin nube. Sin clave de API.

**Idiomas:** [English](./README.md) · [日本語](./README.ja.md) · [简体中文](./README.zh-CN.md) · [Русский](./README.ru.md) · Español

---

## Cuándo usarlo

Es un **Cost Guard local** y un conjunto de runtime guardrails para agentes de IA en Claude Code.

No sirve solo para responder “¿cuánto costó?”, sino para casos como estos:

- detectar **runaway spend**, loops o retry storms antes de quemar el presupuesto;
- dar al agente una política local de **budget intervention** que pueda leer y obedecer;
- ver qué **branch o subagent** consumió realmente el presupuesto;
- relacionar un spike de coste con una herramienta, turn o no-progress churn concreto;
- estimar el siguiente run con forecast y pre-run estimate antes de lanzarlo.

## Instalación

Elige tu cliente. Todas las opciones usan `npx` — no hay nada que instalar globalmente.

### Claude Desktop

Edita el archivo de configuración de Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Añade la entrada `agent-cost` bajo `mcpServers`:

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

Cierra Claude Desktop por completo y reinícialo. El indicador MCP en la esquina inferior derecha del campo de chat debería mostrar 11 herramientas.

### Claude Code

Un solo comando:

```bash
claude mcp add --transport stdio agent-cost -- npx -y @vk0/agent-cost-mcp
```

O añade un servidor con alcance de proyecto colocando esto en `.mcp.json` en la raíz:

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

> **Usuarios de Windows:** envuelve el comando en `cmd /c`:
> `claude mcp add --transport stdio agent-cost -- cmd /c npx -y @vk0/agent-cost-mcp`

### Cursor

Crea `.cursor/mcp.json` en la raíz del proyecto (o `~/.cursor/mcp.json` para una instalación global):

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

Abre la configuración MCP de Cline (icono de MCP Servers → **Configure**) y añade:

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

En cualquier cliente, pregunta: *«¿Qué herramientas expone agent-cost?»* — deberías ver estos 11 nombres:

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

Si no aparece nada, consulta el [FAQ](#faq).

## Docs / How-to

Si no quieres empezar por el reference completo y prefieres flujos operadores más directos, empieza aquí:

- [Quick setup with Claude Desktop](./docs/claude-desktop-quickstart.md)
- [How to read a `get_subagent_tree` output](./docs/subagent-tree-guide.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./docs/budget-cap-recipe.md)

## Herramientas

Once herramientas MCP que leen logs JSONL locales de Claude Code y forman la superficie actual de Cost Guard.

## Ejemplo de conversación

```
Tú:     ¿Cuánto gasté en Claude Code esta semana?

Agente: [llama a get_cost_trend con days=7]
        En los últimos 7 días ejecutaste 12 sesiones por un total de $4.82.
        El día más caro fue el miércoles con $1.47 en 4 sesiones.

Tú:     ¿Qué herramientas están llenando mi contexto?

Agente: [llama a get_tool_usage]
        Read (42 llamadas, 38% del contexto), Grep (28, 25%), Bash (19, 17%).
        Read domina — revisa si todas esas lecturas siguen siendo necesarias.

Tú:     ¿Alguna optimización rápida para mi última sesión?

Agente: [llama a suggest_optimizations]
        1. Cache-reads representan 34% de los tokens de esta sesión —
           recorta bloques repetidos antes de sesiones largas.
        2. 7 llamadas a herramientas sin resultados enlazados — revisa
           invocaciones abandonadas.
```

## Cómo funciona

```
  ~/.claude/projects/*.jsonl             ┌─────────────────┐
  (logs de sesión de Claude Code) ────▶  │  Parser JSONL   │
                                         │  + pricing.ts   │
                                         └────────┬────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
  Llamada del agente (stdio MCP) ────▶   │  Servidor MCP   │ ─── respuesta JSON
                                         │  (11 herramientas)│
                                         └─────────────────┘
```

- **El parser** lee los campos de uso por turno (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) directamente de las líneas JSONL que produce Claude Code.
- **La tabla de precios** (`src/pricing.ts`) contiene tarifas por millón de tokens para `claude-sonnet-4` y `claude-opus-4`, con un fallback `default` para que modelos desconocidos sigan devolviendo un resumen en lugar de fallar.
- **El servidor MCP** expone cuatro herramientas tipadas sobre stdio, devolviendo tanto texto legible como `structuredContent` validado con Zod.
- **Cero tráfico de red.** Sin telemetría, sin clave de API, sin sincronización en la nube. Si desinstalas el paquete, no queda nada.

## Comparación con alternativas

Estas herramientas se solapan, pero optimizan preguntas distintas. La versión corta: si quieres un **Cost Guard local, MCP-first** sobre logs de Claude Code, usa `@vk0/agent-cost-mcp`; si tu prioridad es un dashboard, reporting usage-first o un burn monitor, otra alternativa puede encajar mejor.

| Herramienta | Encaja mejor cuando... | Dónde `@vk0/agent-cost-mcp` es más fuerte |
| --- | --- | --- |
| **ccusage** | Quieres un terminal/TUI pulido para usage reporting e historial | Es más fuerte cuando necesitas local guardrails, branch attribution y budget actions legibles por agentes, no solo un dashboard de uso |
| **claude-usage** | Quieres usage summaries ligeros y reporting rápido | Es más fuerte en runaway detection, tool-level forensics y en responder “¿qué quemó realmente el presupuesto?” |
| **Claude-Code-Usage-Monitor** | Tu prioridad es una vista tipo monitor de los usage patterns | Es más fuerte cuando además del monitoreo necesitas subagent attribution, anomaly detection y follow-up accionable dentro del MCP loop |
| **Token Analyzer MCP** | Necesitas un token-analysis utility más general, no tan atado a Claude Code session logs | Es más fuerte para Cost Guard con Claude Code JSONL reales, pricing-aware cost math, budget thresholds y session-oriented analysis |
| **CodeBurn** | Te importa más el burn-rate monitoring y las alertas que la forénsica local post-run | Es más fuerte para responder “¿qué branch / tool / retry loop causó el burn y debería detenerse el agente?” |

Caveats honestos:

- si solo quieres un número rápido nativo, `/cost` o `/usage` siguen siendo la mejor respuesta;
- si tu flujo es más reporting-first o monitor-first, `ccusage`, `claude-usage`, Claude-Code-Usage-Monitor o CodeBurn pueden ser mejores opciones;
- `@vk0/agent-cost-mcp` es deliberadamente más estrecho: logs JSONL locales de Claude Code, análisis de coste con pricing-aware math y respuestas tipo guardrail dentro del agent loop.

## FAQ

<details>
<summary><strong>¿Envía datos a algún sitio?</strong></summary>

No. Todo funciona localmente. El servidor analiza archivos JSONL de tu directorio `~/.claude/projects/`, ejecuta matemáticas en Node y devuelve JSON al cliente MCP. No hay telemetría, ni endpoints de analítica, ni sincronización en la nube. Puedes ejecutarlo con la red desactivada.
</details>

<details>
<summary><strong>¿Qué tan preciso es el cálculo de coste?</strong></summary>

Los estimados coinciden con el `/cost` integrado de Claude Code dentro de ~5% en nuestras sesiones de dogfood. El delta exacto depende de la tabla de precios en `src/pricing.ts` y de qué tan completos están los campos de uso en tu JSONL. **No** es una fuente de verdad de facturación — siempre reconcilia con tu factura real de Anthropic antes de tomar decisiones de negocio.
</details>

<details>
<summary><strong>¿Funciona con sesiones de Cursor, Cline o Continue?</strong></summary>

Todavía no. El parser actualmente apunta al formato de logs JSONL de Claude Code (`~/.claude/projects/**/*.jsonl`). Cursor, Cline y Continue registran sesiones en otras ubicaciones y formatos. PRs bienvenidos — abre un issue con una muestra del log.
</details>

<details>
<summary><strong>¿Necesita una clave de API?</strong></summary>

No. Ni clave de Anthropic, ni token de npm, ninguna autenticación. El servidor es read-only sobre tu sistema de archivos local.
</details>

<details>
<summary><strong>¿Por qué MCP en lugar de un CLI?</strong></summary>

Ambos están soportados. El paquete incluye una entrada `bin` (`agent-cost-mcp <session.jsonl>`) para análisis puntuales desde la terminal. Pero el servidor MCP es la superficie principal: cuando tu agente de IA puede llamar las herramientas directamente, obtienes visibilidad de costes *dentro* de la conversación donde ocurre el gasto.
</details>

<details>
<summary><strong>Los precios cambiaron. ¿La tabla se actualiza automáticamente?</strong></summary>

No, by design. `src/pricing.ts` es un módulo TypeScript plano: predecible, auditable, forkable. Cuando Anthropic publique nuevas tarifas, actualiza las constantes y reejecuta. La auto-actualización requeriría tráfico de red, lo que contradice el principio local-first.
</details>

<details>
<summary><strong>El servidor MCP no aparece en mi cliente. ¿Qué reviso?</strong></summary>

1. **Reinicia el cliente por completo** tras editar el archivo de configuración.
2. **Ejecútalo manualmente:** `npx -y @vk0/agent-cost-mcp` — deberías ver un servidor MCP iniciarse y esperar en stdio (Ctrl+C para salir). Si falla, tienes un problema de instalación.
3. **Revisa los logs de Claude Desktop:** `~/Library/Logs/Claude/mcp*.log` (macOS) o `%APPDATA%\Claude\logs\mcp*.log` (Windows).
4. **Verifica Node ≥18:** `node --version`. El paquete requiere Node 18+.
</details>

## Limitaciones

- **Estimaciones, no facturación.** Los costes derivan de campos de uso por turno × una tabla de precios local. No sustituye tu factura de Anthropic.
- **Tabla de precios manual.** `src/pricing.ts` debe actualizarse cuando cambien las tarifas (by design — sin llamadas de red silenciosas).
- **Solo Claude Code.** Las sesiones de Cursor/Cline/Continue no se analizan. Podrían añadirse otros clientes según demanda.
- **Descubrimiento local de archivos.** El servidor lee archivos de la ruta que le pases. No consulta el estado en tiempo real de Claude Code.
- **Salida JSON estructurada.** Sin dashboards, sin gráficos, sin UI web. Es una característica: el cliente MCP es la UI.
- **Cache-reads depende del origen.** Si los logs JSONL no incluyen los campos de cache-read/cache-creation, se reportan como cero.

## CLI standalone

El mismo parser está expuesto como CLI para análisis puntuales sin cliente MCP:

```bash
npx -y @vk0/agent-cost-mcp ~/.claude/projects/my-project/session.jsonl
npx -y @vk0/agent-cost-mcp session.jsonl --subagent subagent.jsonl
```

Devuelve el mismo JSON que la herramienta MCP `get_session_cost`.

## Desarrollo

Clona el repo y ejecuta:

```bash
npm ci           # instalar dependencias
npm run build    # compilar a dist/
npm test         # tests unitarios vitest
npm run lint     # tsc --noEmit
npm run smoke    # smoke test end-to-end del cliente MCP
```

Stack: TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest.

## Changelog

Ver [CHANGELOG.md](./CHANGELOG.md). Este proyecto sigue [semantic versioning](https://semver.org) desde v1.0.0.

## Contribuir

Issues y PRs bienvenidos en [github.com/vk0dev/agent-cost-mcp](https://github.com/vk0dev/agent-cost-mcp). Para nuevas entradas en la tabla de precios, cambios de formato de logs o soporte de clientes adicionales, abre primero un issue con una fixture de muestra.

## Licencia

[MIT](./LICENSE) © vk0.dev
