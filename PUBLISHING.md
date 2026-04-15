# Publishing Playbook

How to release updates and manage marketplace presence for `@vk0/agent-cost-mcp`.
This document is for **any agent** (Claude Code, OpenClaw, Cursor, Cline, or manual) — not tied to a specific tool.

---

## Releasing an update (v1.1, v2.0, etc.)

### What you do

```bash
# 1. Version bump — sync in 4 places:
#    package.json, .claude-plugin/plugin.json, server.json, src/createServer.ts

# 2. Update CHANGELOG.md with new entry

# 3. Verify
npm run build && npm test && npm run lint && npm run smoke

# 4. Commit + tag + push
git add -A
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

### What happens automatically

| Platform | Mechanism | Delay |
|----------|-----------|-------|
| **npm** | CI `publish.yml` triggered by tag `v*` | ~1 min |
| **GitHub Release** | CI `softprops/action-gh-release` | ~1 min |
| **GitHub Pages** | CI `pages.yml` on push to main | ~2 min |
| **Glama.ai** | Auto-scraping npm by keyword `mcp-server` | 24-48h |
| **MseeP / MCPServers.org** | Auto-scraping npm | 24-48h |
| **PulseMCP** | Auto-ingests from Official MCP Registry | 1-7 days |

### What you run manually after npm publish

```bash
# Smithery (API key in Bitwarden as "Smithery API Key")
SMITHERY_API_KEY="<key>" npx @smithery/cli@latest mcp publish

# Official MCP Registry
mcp-publisher publish
```

mcp.so and Awesome MCP Servers do not need updates per release.

---

## Marketplace status

| Marketplace | First submission | Updates | Notes |
|-------------|-----------------|---------|-------|
| **npm** | CI on tag push | CI on tag push | Primary distribution channel |
| **GitHub Release** | CI auto | CI auto | From `publish.yml` |
| **GitHub Pages** | CI auto | CI auto | Landing at `vk0dev.github.io/agent-cost-mcp` |
| **Awesome MCP Servers** | PR (one-time) | Not needed | Static listing, PR #4884 |
| **mcp.so** | Web form (done) | Likely auto-scraping | Submitted via Playwright |
| **Smithery** | CLI `mcp publish` | CLI `mcp publish` | Requires `createSandboxServer` export |
| **Official MCP Registry** | CLI `mcp-publisher` | CLI `mcp-publisher` | Powers PulseMCP + Claude Code discovery |
| **PulseMCP** | Auto from Registry | Auto from Registry | No manual action needed |
| **Glama / MseeP / MCPServers.org** | Auto from npm | Auto from npm | By keyword `mcp-server` |

---

## Credentials

Stored in Bitwarden (accessible via `bw` CLI when unlocked):

| Credential | BW Item Name | Used for |
|------------|-------------|----------|
| npm token | In `~/.npmrc` + GitHub repo secret `NPM_TOKEN` | npm publish via CI |
| Smithery API Key | "Smithery API Key" | `npx @smithery/cli mcp publish` |
| GitHub OAuth | `gh auth` (keyring) | `mcp-publisher`, `gh` CLI, PR creation |

---

## First release checklist (for new MCP projects)

One-time setup when publishing a brand new MCP server:

```bash
# 1. Create GitHub repo + push
gh repo create vk0dev/<name> --public --source=. --push

# 2. Add NPM_TOKEN to repo secrets
gh secret set NPM_TOKEN --repo vk0dev/<name> \
  --body $(grep _authToken ~/.npmrc | cut -d= -f2)

# 3. Enable GitHub Pages
gh api repos/vk0dev/<name>/pages -X POST -f build_type=workflow

# 4. Add topics for discoverability
gh api repos/vk0dev/<name>/topics -X PUT \
  -f "names[]=mcp" -f "names[]=mcp-server" -f "names[]=claude-code" \
  -f "names[]=anthropic" -f "names[]=developer-tools"

# 5. Push tag to trigger first publish
git tag -a v1.0.0 -m "v1.0.0"
git push origin main --follow-tags

# 6. Marketplace submissions (see table above)
# - Awesome MCP Servers: fork + PR via gh CLI
# - mcp.so: Playwright → GitHub OAuth → form
# - Smithery: npx @smithery/cli mcp publish
# - Official Registry: mcp-publisher publish
# - Others: auto-scraping, no action needed

# 7. Social preview
# Upload docs/og-image.png via GitHub Settings (or JS injection)
```

---

## Version sync locations

When bumping version, update ALL of these:

1. `package.json` → `"version": "X.Y.Z"`
2. `.claude-plugin/plugin.json` → `"version": "X.Y.Z"`
3. `server.json` → `"version": "X.Y.Z"` (two places: root + packages[0])
4. `src/createServer.ts` → `version: 'X.Y.Z'`
