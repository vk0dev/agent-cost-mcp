# Smithery ingest follow-up for agent-cost-mcp
**Date:** 2026-05-06  
**Status:** NO_REPO_CHANGE_NEEDED  
**Audience:** main / operator / future marketplace triage

## Why this note exists
Smithery currently renders weak public metadata for `agent-cost-mcp` even though the repo already carries materially stronger metadata. This note records the current conclusion so future triage does not need to re-run the same repo inspection loop unless new evidence appears.

## Visual observation from manual operator pass
The manual marketplace verification pass recorded the following live Smithery render issues:
- `No description`
- `No capabilities found`

This observation came from the manual verdict file:
- `business/agent-cost-mcp-marketplace-manual-verdict-2026-05-06.md`

## Repo metadata surfaces checked
The following repo-owned surfaces were re-checked against the Smithery under-render:
- `package.json`
- `server.json`
- `README.md` (marketplace/discovery/install truth only)

## Current repo truth already present
### package.json
Current repo metadata already includes:
- package name `@vk0/agent-cost-mcp`
- version `2.3.0`
- bounded product description aligned to the Cost Guard wedge
- homepage
- repository URL
- MIT license
- marketplace/discovery keywords

### server.json
Current repo metadata already includes:
- MCP server identity and version
- package linkage
- bounded runtime/cost-guard description
- repo/website linkage expected for submission/discovery surfaces

### README.md
Current landing page already includes:
- install guidance for real client flows
- current discovery/listing truth without false marketplace claims
- current shipped feature surface and demo/doc links

## Current conclusion
**NO_REPO_CHANGE_NEEDED**

Why:
- Smithery under-render is real, but it does not currently point to one exact missing or incorrect repo-owned field.
- Repo/package/server/README truth is already materially stronger than the weak Smithery render.
- No field-level evidence currently proves that changing repo metadata would fix the observed Smithery output.

## What would justify a real coder patch later
Open a new bounded coder task only if one of these becomes true:
1. A future Smithery/operator/browser flow identifies one exact missing or malformed field in `package.json`, `server.json`, or `README.md`.
2. Smithery documentation/support confirms a specific metadata contract that the repo does not currently satisfy.
3. A side-by-side ingest comparison shows another server with the same marketplace path renders correctly only because it exposes one repo-owned field that `agent-cost-mcp` lacks.
4. The manual operator pass captures a reproducible parser/ingest expectation tied to one concrete file and one concrete field.

## What should be tried next before another coder task
1. Re-check the live Smithery page after any marketplace-side refresh window or cache rollover.
2. If still under-rendered, use an operator/browser flow to inspect whether Smithery exposes a support/debug hint, raw metadata payload, or ingest source explanation.
3. If support is reachable, ask which exact repo field they read for description/capabilities.
4. Only after one exact field is named should another coder task be opened.

## One-line reuse verdict
Smithery is under-rendering `agent-cost-mcp`, but current evidence still points to an external ingest/render issue rather than a proven repo metadata bug, so the correct state remains **NO_REPO_CHANGE_NEEDED** until a field-level mismatch is identified.
