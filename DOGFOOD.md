# Dogfood log

## Session 1
- Parsed the fixture-backed main session log and verified turn-level token aggregation.
- Confirmed tool-result linking stays stable when tool IDs are present in assistant content.

## Session 2
- Ran the parser with a subagent JSONL fixture and verified combined totals and source file tracking.
- Checked the summary shape for downstream MCP tool compatibility.

## Session 3
- Recomputed pricing using the config-driven pricing table for Sonnet and Opus examples.
- Verified build, lint, and Vitest pass before packaging checks.
