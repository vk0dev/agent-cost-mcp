
## [1.0.4] — 2026-04-22

### Added
- Live watch mode in CLI summary for continuous session cost visibility (`feat(cli): add live watch mode`)

### Changed
- Sharpened README positioning around cost optimization vs generic spend tracking
- README heading `Install` → `Installation` for consistency


All notable changes to `@vk0/agent-cost-mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] — 2026-04-15

### Added

- Comparison table vs alternatives (API Dashboard, manual grep/jq) in all 5 README languages.
- Dependabot ignore rules for major version bumps (TypeScript 6, Vitest 4).
- `.mcpregistry_*` added to `.gitignore` for token file safety.

### Changed

- CI actions bumped: checkout v6, configure-pages v6, deploy-pages v5, upload-pages-artifact v5, gh-release v3.
- Dependencies bumped: @types/node 25.6.0, zod 4.3.6.

## [1.0.1] — 2026-04-15

### Added

- `createServer()` and `createSandboxServer()` exports from `src/createServer.ts` for programmatic use and Smithery compatibility.
- `PUBLISHING.md` — marketplace publishing playbook for any agent (not just Claude Code).

### Changed

- Refactored `src/server.ts` to use `createServer()` factory instead of inline construction. No behavior change for CLI/stdio users.

## [1.0.0] — 2026-04-11

First public release. Public API frozen — semver from here on.

### Added

- **`get_session_cost`** — parse a single Claude Code JSONL session log and return token totals, cache-read/cache-creation breakdown, turn count, and estimated USD cost.
- **`get_tool_usage`** — aggregate tool invocations across one session or a filtered project log directory, reporting per-tool call counts and context-share percentages.
- **`get_cost_trend`** — roll session logs into a day-by-day cost trend for a local project path, with per-day sessions, tokens, and estimated spend.
- **`suggest_optimizations`** — generate lightweight optimization suggestions (cache-read ratios, abandoned tool calls, heaviest turns) from a parsed session log.
- Stdio MCP server exposing the four tools via `@modelcontextprotocol/sdk`.
- Standalone CLI (`agent-cost-mcp <session.jsonl> [--subagent <path>]`) for one-off cost analysis.
- Config-driven pricing table for `claude-sonnet-4` and `claude-opus-4` model families.
- Plugin metadata (`.claude-plugin/plugin.json`) for Claude Code plugin discovery.
- MCP Registry manifest (`server.json`) for submission to the Official and Anthropic MCP Registries.

### Design principles

- **Local-first:** everything runs locally, parsing `~/.claude/projects/**/*.jsonl`. Zero network egress. No API key required.
- **Config-driven:** pricing table is editable; no hardcoded assumptions about model costs outside a single config file.
- **Accurate within bounds:** estimates track Claude Code's `/cost` output within ~5% on dogfood sessions. Deviations are documented in README limitations.

[1.0.0]: https://github.com/vk0dev/agent-cost-mcp/releases/tag/v1.0.0
