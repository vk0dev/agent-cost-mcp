## [Unreleased]

### Security
- Upgraded Vitest from 3.2.4 to 4.1.8 to fix critical GHSA-5xrq-8626-4rwp (arbitrary file read/exec via UI server).
- Added npm `overrides` for transitive dependencies: fast-uri ≥3.1.2 (GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc), hono ≥4.12.21, ip-address ≥10.2.0, qs ≥6.15.2. Total audit findings: 9 → 0.

### Fixed
- Updated forecast tests to use relative timestamps (days ago from now) instead of hardcoded May 2026 dates, preventing test failures as lookback windows age out.

## [2.3.3] - 2026-05-12

### Fixed
- Preserved tiny positive daily spend through pricing and trend aggregation, and refreshed the anomaly forecast fixture timestamps so the zero-cost-day anomaly contract stays green under the current lookback window.

## [2.3.2] - 2026-05-09

### Fixed
- Aggregated daily trend and anomaly baselines by assistant row timestamp so recent days inside multi-day JSONL files no longer disappear when the containing file has an older mtime.

## [2.3.1] - 2026-05-06

### Fixed
- Reduced runaway false positives by suppressing short transient-failure clusters that recover quickly on the same tool.
- Reduced runaway false positives for productive same-tool refinement when targets narrow meaningfully without turning into retry storms.

## [2.3.0] - 2026-05-04

### Added
- Added bounded sparse-history forecast fallback heuristics with additive adjustment metadata so short, bursty histories can reduce rc2 overshoot without changing the deterministic local-first forecast method.

## [2.2.0] - 2026-05-04

### Added
- Added bounded budget cap enforcement modes so configured caps can stay advisory in `warn` mode or surface a hard refusal signal in `block` mode while preserving response-shape discipline.
- Added additive multi-provider attribution metadata with deterministic `anthropic`, `openai`, `google`, and `unknown` provider inference through parser and relevant tool output paths.

## [2.1.0] - 2026-05-04

### Added
- Added quartile-based `forecast_confidence` with deterministic projected range bounds for sparse, bursty, and stable forecast histories while preserving the existing `recency-weighted-average-rc2` method.
- Added additive `subtreeCost` rollups to subagent tree nodes so parent nodes surface full descendant spend at a glance.

## [2.0.1] - 2026-05-04

### Fixed
- Aligned `server.json` package metadata with the shipped 2.0.0 release so MCP publish metadata no longer reports a stale `2.0.0-beta.9` package version.

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
