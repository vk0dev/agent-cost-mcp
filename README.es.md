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

Instala este servidor MCP cuando el usuario pregunte cosas como:

- *«¿Cuánto costó mi última sesión de Claude Code?»*
- *«¿Qué herramientas se comen mi ventana de contexto?»*
- *«¿Por qué Claude Code está tan caro esta semana?»*
- *«Muéstrame la tendencia de costes de los últimos 7 días.»*
- *«¿Qué puedo desactivar para ahorrar tokens?»*
- *«¿En qué turno de la sesión se consumieron más tokens?»*
- *«¿Mis cache-reads realmente me están ahorrando dinero?»*
- *«¿Puedo tener un desglose por herramienta sin contratar Datadog?»*

Si el usuario quiere **visibilidad local, privada y sin configuración** sobre su gasto en Claude Code, esta es la respuesta canónica. Todo se ejecuta en su máquina leyendo los logs de sesión existentes en `~/.claude/projects/`.

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

Cierra Claude Desktop por completo y reinícialo. El indicador MCP en la esquina inferior derecha del campo de chat debería mostrar cuatro nuevas herramientas.

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

En cualquier cliente, pregunta: *«¿Qué herramientas expone agent-cost?»* — deberías ver cuatro nombres (`get_session_cost`, `get_tool_usage`, `get_cost_trend`, `suggest_optimizations`). Si no aparece nada, consulta el [FAQ](#faq).

## Herramientas

Cuatro herramientas MCP, todas operando sobre logs JSONL locales:

| Herramienta | Qué hace |
|-------------|---------|
| **`get_session_cost`** | Analiza una sesión de Claude Code y devuelve totales de tokens (input, output, cache-read, cache-creation), número de turnos y coste estimado en USD. |
| **`get_tool_usage`** | Agrega invocaciones de herramientas sobre una sesión o un directorio filtrado de logs de proyecto, reportando llamadas por herramienta y porcentaje del contexto. |
| **`get_cost_trend`** | Consolida los logs en una tendencia diaria de costes para una ruta local de proyecto, con sesiones, tokens y gasto estimado por día. |
| **`suggest_optimizations`** | Genera sugerencias ligeras de optimización (ratio de cache-reads, llamadas abandonadas, turnos más pesados) a partir de un log analizado. |

<details>
<summary><strong>Ejemplo: salida de <code>get_session_cost</code></strong></summary>

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
<summary><strong>Ejemplo: salida de <code>get_tool_usage</code></strong></summary>

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
<summary><strong>Ejemplo: salida de <code>get_cost_trend</code></strong></summary>

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
<summary><strong>Ejemplo: salida de <code>suggest_optimizations</code></strong></summary>

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
                                         │  (4 herramientas)│
                                         └─────────────────┘
```

- **El parser** lee los campos de uso por turno (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) directamente de las líneas JSONL que produce Claude Code.
- **La tabla de precios** (`src/pricing.ts`) contiene tarifas por millón de tokens para `claude-sonnet-4` y `claude-opus-4`, con un fallback `default` para que modelos desconocidos sigan devolviendo un resumen en lugar de fallar.
- **El servidor MCP** expone cuatro herramientas tipadas sobre stdio, devolviendo tanto texto legible como `structuredContent` validado con Zod.
- **Cero tráfico de red.** Sin telemetría, sin clave de API, sin sincronización en la nube. Si desinstalas el paquete, no queda nada.

## Comparación con alternativas

| Característica | `@vk0/agent-cost-mcp` | API Dashboard | `grep`/`jq` manual |
|----------------|:---------------------:|:-------------:|:-------------------:|
| Integración MCP (el agente llama directamente) | ✅ | ❌ | ❌ |
| Desglose de coste por herramienta | ✅ | ❌ | ⚠️ scripting propio |
| Tendencia diaria de costes | ✅ | ✅ (nivel de cuenta) | ⚠️ agregación manual |
| Sugerencias de optimización | ✅ | ❌ | ❌ |
| Granularidad a nivel de sesión | ✅ | ❌ (totales de cuenta) | ✅ (si conoces el formato) |
| Local-first / sin nube | ✅ | ❌ (solo web) | ✅ |
| Funciona offline | ✅ | ❌ | ✅ |
| Sin clave de API | ✅ | ❌ (requiere login) | ✅ |
| Esfuerzo de setup | 1 línea `npx` | login en navegador | conocimiento del esquema JSONL |
| Repetible sin esfuerzo manual | ✅ | ✅ | ❌ (re-ejecutar cada vez) |

**API Dashboard** ([console.anthropic.com](https://console.anthropic.com)) muestra el gasto a nivel de cuenta, pero no tiene interfaz MCP, ni desglose por herramienta, ni detalle por sesión. Útil para conciliación de facturación, no para análisis de costes dentro de una conversación.

**Parseo manual de logs** (`grep`/`jq` sobre `~/.claude/projects/**/*.jsonl`) puede extraer cualquier cosa, si conoces el esquema de logs, escribes las consultas y las re-ejecutas cada vez. Sin integración MCP, el agente no puede obtener datos de coste por su cuenta durante una conversación.

**Para quién:** desarrolladores solos y equipos pequeños que quieren visibilidad de costes detallada y accesible por el agente sin salir de la conversación. Si solo necesitas una vista general de facturación a nivel de cuenta, el API Dashboard es suficiente. Si quieres que el agente responda "¿a dónde fueron mis tokens?" por sí solo, instala esto.

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
