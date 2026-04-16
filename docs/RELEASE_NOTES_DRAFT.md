# agent-cost-mcp v1.0.3 draft

**Release type:** patch, publish-infra refresh only.

## Summary

This draft covers the current unreleased HEAD after `v1.0.2`.

- Current HEAD: `5212d44`
- Last published npm version: `1.0.2`
- Recommended next version if a new npm release is desired: `1.0.3`

## What changed since v1.0.2

- Fixed the publish workflow to call the real `mcp-publisher` binary instead of a nonexistent npm command.
- No user-facing MCP tool behavior changed.
- No packaged runtime files changed relative to `v1.0.2`; the delta is release automation only.

## Release positioning

This is a maintenance patch for release reliability.

Suggested one-line changelog summary:

> fix(ci): use the real MCP publisher binary in release automation

## GO-time commands

Run only after explicit publish GO:

```bash
npm version patch
npm install
npm test
npm run lint
npm run build
npm run smoke
npm pack --json
npm publish --provenance --access public
git push --follow-tags
```

## Pre-publish checks to re-run at GO time

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run smoke`
- `npm pack --json`
- `npm view @vk0/agent-cost-mcp version dist-tags --json`

## Notes

- If you do **not** want to ship an infra-only patch, keep npm at `1.0.2` and wait for the next user-facing change.
- If you do want HEAD traceability on npm, publish as `v1.0.3` so the registry matches the current Git state.
