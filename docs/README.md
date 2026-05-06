# Docs and quick recipes

Use this page when you want the shortest path to the most common `@vk0/agent-cost-mcp` workflows without reading the full root README.

## Start here

- [5-minute setup with Claude Desktop](./claude-desktop-quickstart.md)
- [Budget cap recipe: when to use 80% soft alert vs 100% hard cap](./budget-cap-recipe.md)

## Forecast workflow

If you are using `get_cost_forecast`, read the output in this order:

1. **baseline daily spend** tells you the recent local burn rate the forecast is anchored to
2. **projected total** tells you the expected spend across the forecast window you asked for
3. **projected monthly spend** helps translate that short window into an operator budget number
4. **confidence** tells you how much to trust the projection before acting on it

### Forecast confidence quick guide

- **high** means the recent local history is stable enough to treat the projection as a stronger planning input
- **medium** means the forecast is still useful, but you should treat it as directional and check the reason flags
- **low** means the history window is sparse or noisy enough that the forecast is better for awareness than for strict budget decisions

If confidence includes notes like short history or sparse history, use the forecast as an early warning signal, not as a hard commit for future spend.

For a quick visual example, see the already-shipped [forecast / cap-hit demo GIF](./demo-forecast.gif).

## Budget-cap workflow

Use the [budget cap recipe](./budget-cap-recipe.md) for the full walkthrough. The short operator rule is:

- use an **80% soft alert** when you want early warning and a human or agent should still decide what to do next
- use a **100% hard cap** when crossing the budget should block or stop further spend automatically

A practical starting pattern is to set both: 80% for warning, 100% for enforcement.

## What this docs index does not replace

This page is a shortcut. For installation details, full tool reference, and broader product context, go back to the [project README](../README.md).
