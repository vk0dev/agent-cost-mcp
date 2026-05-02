## [2.0.0] — 2026-05-02

### Added
- Added a GitHub OIDC workflow-dispatch recovery path to republish `server.json` to the Official MCP Registry without rerunning npm release semantics.

## [2.0.0-beta.8] — 2026-04-29

### Added
- Added deterministic daily marketplace invariant auditing for the verified Smithery surface and README marketplace-alignment drift checks.

### Changed
- Upgraded the local cost forecast baseline from the flat rc.1 average to a deterministic non-seasonal recency-weighted daily average (`recency-weighted-average-rc2`).
- Tuned runaway detection to stay progress-aware and expose structured `runaway_reason_code` output for identical loops, alternating cycles, and retry storms.

## [2.0.0-beta.7] — 2026-04-29

### Fixed
- Triggered a no-op follow-up beta release after the CI OIDC registry publish path landed so future tag pushes can refresh the Official MCP Registry listing without local device-flow OAuth.

## [2.0.0-beta.6] — 2026-04-27

### Fixed
- Wired telemetry through the remaining cost analysis tools so the Tier 3 analytics surface now uses the intended local telemetry path consistently.

## [2.0.0-beta.5] — 2026-04-26

### Added
- `get_subagent_tree` for bounded root-plus-subagent session tree analysis with local cost attribution.
- `get_cost_forecast` for bounded rc.1 local-first spend projection using recent daily trend averages.

### Changed
- `detect_cost_anomalies` now surfaces bounded runaway loop detection via `runaway_detected`, `runaway_signature`, and `suggested_action`.
- Tier 3 analytics now route forecast telemetry through an explicit no-op telemetry client abstraction instead of calling the webhook emitter directly.

### Fixed
- Tests now align with the committed 3-log fixture set and include focused coverage for loop detection, subagent tree output, and sparse forecast behavior.

## [2.0.0-beta.4] — 2026-04-26

### Fixed
- Added optional `_meta` to Tier 2 structured outputs for `detect_cost_anomalies`, `get_tool_roi`, and `estimate_run_cost`, and return `_meta: {}` in v2 responses for RFC consistency.
- Added focused tests that lock the `_meta` contract on the Tier 2 tool outputs.

## [2.0.0-beta.3] — 2026-04-26

### Added
- `estimate_run_cost` — pre-run cost estimate tool with prompt/output/cache assumptions and optional budget check.
- `get_tool_roi` — bounded per-tool ROI heuristic using linked results, context share, and estimated cost share.
- `detect_cost_anomalies` — local daily spend anomaly view against recent baseline.

### Changed
- Tier 2 tool surface expanded with local-first, no-network analysis flows built on existing pricing and parser primitives.
