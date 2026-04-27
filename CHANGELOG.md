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
