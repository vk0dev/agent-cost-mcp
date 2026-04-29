# How to read a `get_subagent_tree` output

Use `get_subagent_tree` when one Claude Code session launched child agents and you need to know where the spend actually went.

A flat session total can hide the real culprit. The tree shows whether the parent session was cheap while one child branch burned the budget.

## What the tool returns

The response has four parts that matter most:

- `rootSessionPath`: the main session you asked about
- `totalSessions`: parent plus all included child sessions
- `totalCostUsd`: rolled-up estimated cost for the whole tree
- `tree`: the nested structure with one node per session

A typical shape looks like this:

```json
{
  "projectPath": "/Users/me/.claude/projects/my-project",
  "rootSessionPath": "/Users/me/.claude/projects/my-project/session-main.jsonl",
  "totalSessions": 3,
  "totalCostUsd": 8.69,
  "tree": {
    "sessionPath": "/Users/me/.claude/projects/my-project/session-main.jsonl",
    "sessionId": "session-main",
    "estimatedCostUsd": 8.69,
    "turnCount": 12,
    "inputTokens": 182000,
    "outputTokens": 9400,
    "children": [
      {
        "sessionPath": "/Users/me/.claude/projects/my-project/session-subagent-a.jsonl",
        "sessionId": "session-subagent-a",
        "estimatedCostUsd": 8.66,
        "turnCount": 10,
        "inputTokens": 180000,
        "outputTokens": 9100,
        "children": []
      },
      {
        "sessionPath": "/Users/me/.claude/projects/my-project/session-subagent-b.jsonl",
        "sessionId": "session-subagent-b",
        "estimatedCostUsd": 0.01,
        "turnCount": 2,
        "inputTokens": 2000,
        "outputTokens": 300,
        "children": []
      }
    ]
  }
}
```

## How to interpret the important fields

### `totalCostUsd`

This is the top-line rolled-up spend for the session tree.

Use it to answer, "How expensive was this run overall?" Do not use it alone to answer, "Which branch caused it?"

### `estimatedCostUsd` on each node

This is the field you use for attribution.

Look for:

- one child that is much larger than its siblings
- a child that is almost the same size as the root total
- a parent with low direct activity but a large rolled-up total

If a child is carrying almost all the dollars, that child is the branch to inspect next.

### `children`

This is the nesting. Each child represents a subagent session attached under the node above it.

Interpretation rule:

- parent node = orchestration context
- child node = delegated work branch

When there are multiple children, compare them before reading raw logs. The biggest child usually deserves attention first.

### `turnCount`

This is useful for spotting expensive short failures versus long productive runs.

Examples:

- **High cost, low turn count** often means a few oversized turns or huge context payloads.
- **High cost, high turn count** can mean a retry loop, wandering research, or too much delegation.
- **Low cost, high turn count** may still be acceptable if the branch stayed lightweight.

### `inputTokens` and `outputTokens`

Use these to understand whether the branch was expensive because it consumed a lot of context, generated a lot of output, or both.

A few practical reads:

- very high `inputTokens` usually means repeated large context blocks, many file reads, or oversized prompts
- very high `outputTokens` can mean verbose agent responses or over-detailed intermediate work
- high input with modest output is a common signature of wasteful exploration

## Fast reading workflow

When Claude shows you a tree, use this order:

1. Read `totalCostUsd` to gauge the size of the problem.
2. Compare `estimatedCostUsd` across the root and children.
3. Find the largest child branch.
4. Check that branch's `turnCount`, `inputTokens`, and `outputTokens`.
5. Only then decide whether to inspect that session with `get_session_cost`, `get_tool_usage`, or `suggest_optimizations`.

## Example diagnosis patterns

### Pattern 1: One child ate almost everything

- Root total: `$8.69`
- Child A: `$8.66`
- Child B: `$0.01`

Interpretation: the run was not broadly expensive. One delegated branch went sideways.

Next move: inspect that child session for repeated tools, abandoned results, or oversized prompts.

### Pattern 2: Several mid-sized children

- Root total: `$6.20`
- Three children around `$1.8` to `$2.2`

Interpretation: the cost came from broad parallel delegation, not a single runaway branch.

Next move: question whether all subagents were necessary, then compare each child's task quality.

### Pattern 3: Expensive root, tiny children

- Root total: `$4.90`
- Children together: `$0.30`

Interpretation: the parent conversation itself is the main cost driver. The issue is probably prompt size, tool churn, or long orchestration in the main session.

Next move: inspect the root with `get_tool_usage` and `suggest_optimizations`.

## What this tool does not tell you by itself

`get_subagent_tree` is for structure and attribution. It does not explain intent or productivity.

After you find the expensive branch, pair it with:

- `get_session_cost` for a direct cost summary
- `get_tool_usage` for tool frequency
- `get_tool_roi` for weak-value tool patterns
- `suggest_optimizations` for concrete follow-up hints

## Practical prompt to use with your agent

```text
Use get_subagent_tree on my latest session. Show me which child branch contributed the highest estimatedCostUsd, what share of totalCostUsd that represents, and whether I should inspect the child or the parent next.
```

That prompt forces the agent to move from raw tree data to a concrete operator decision.
