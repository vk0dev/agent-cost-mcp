# AgentCost MCP

## Stack
- TypeScript, `@modelcontextprotocol/sdk`, Zod
- Vitest for unit tests

## Commands
- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Smoke test: `npm run smoke`

## Publishing
- See [PUBLISHING.md](./PUBLISHING.md) for full marketplace playbook
- Version sync: `package.json`, `.claude-plugin/plugin.json`, `server.json`, `src/createServer.ts`
- Release: `git tag -a vX.Y.Z && git push --follow-tags` → CI publishes to npm

## Architecture
- `src/createServer.ts` — McpServer factory, exports `createServer()` and `createSandboxServer()` (Smithery)
- `src/server.ts` — CLI/stdio entry point, uses `createServer()`
- `src/tools/index.ts` — 4 MCP tools registration
- `src/parser.ts` — JSONL session log parser
- `src/pricing.ts` — config-driven pricing table

## Notes
- Parses Claude Code JSONL session logs from `~/.claude/projects/...`
- Cost estimation is approximate and config-driven
- Local-first, zero network egress
