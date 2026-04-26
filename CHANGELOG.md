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
