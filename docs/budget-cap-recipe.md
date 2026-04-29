# Budget cap recipe: when to use 80% soft alert vs 100% hard cap

`configure_budget` gives you two kinds of control:

- an early warning threshold, usually `80%`
- a stop-now threshold, usually `100%`

The tool stores budget settings locally and cost-query tools return `budget_alert`, `hard_capped`, and `hard_cap_message` when the observed spend crosses your configured limits.

This guide explains when to use each threshold in practice.

## First, what the thresholds mean in this MCP

A typical setup looks like this:

```json
{
  "daily_usd": 25,
  "per_session_usd": 5,
  "alert_thresholds": [80, 100]
}
```

Operational meaning:

- `80` means, "Warn me while I still have room to course-correct."
- `100` means, "This run or day has reached the cap. Treat further work as over-budget."

When a threshold is crossed:

- `budget_alert.threshold` tells you which threshold was hit
- `budget_alert.scope` tells you whether it was the session cap or daily cap
- `hard_capped: true` appears once any configured limit reaches or exceeds `100%`

Important nuance: this MCP reports the condition in tool responses. Your agent or workflow is responsible for actually stopping, escalating, or changing behavior.

## Use `80%` as the soft alert when you still have time to adapt

Choose an `80%` alert when the work is valuable enough to continue, but only if someone checks whether the spend still makes sense.

Good fit:

- exploratory debugging
- agentic research where the answer may still justify the spend
- long-running code tasks with uncertain complexity
- overnight runs where you want a warning before the budget is blown

What to do at `80%`:

1. ask whether the run is still on track
2. trim scope if not
3. reduce delegation if subagents are multiplying cost
4. switch from broad exploration to a narrower question
5. decide explicitly whether the remaining 20% is worth spending

Think of `80%` as a decision checkpoint, not an error state.

## Use `100%` as the hard cap when overspend is worse than delay

Choose `100%` as the line where you want your workflow to stop or hand control back to a human.

Good fit:

- fixed daily budgets
- CI or unattended automations
- production support tasks where spend needs strict control
- shared team environments where one runaway session can consume the budget

What to do at `100%`:

- stop launching more subagents
- stop broad retries
- summarize the current state
- return a human-readable alert with next steps
- resume only after someone raises the cap or narrows the task

If the run continues past `100%`, it should be a conscious exception, not default behavior.

## Practical recipes

### Recipe 1: Solo developer, normal coding day

Use:

```json
{
  "daily_usd": 20,
  "per_session_usd": 4,
  "alert_thresholds": [80, 100]
}
```

Why:

- `80%` catches a session that is getting sloppy before it becomes waste
- `100%` protects against a single unbounded thread or subagent branch

Best when you want flexibility but still need guardrails.

### Recipe 2: Overnight autonomous run

Use:

```json
{
  "daily_usd": 50,
  "per_session_usd": 10,
  "alert_thresholds": [50, 80, 100]
}
```

Why:

- `50%` gives an early heartbeat for unattended runs
- `80%` is the point to shrink scope or stop adding branches
- `100%` is the hard stop

Best when nobody will be watching the run live.

### Recipe 3: Team-shared environment with strict cost control

Use:

```json
{
  "daily_usd": 100,
  "per_session_usd": 8,
  "alert_thresholds": [80, 100]
}
```

Why:

- the daily cap protects the team budget
- the per-session cap prevents one person or one agent loop from eating the whole day
- `100%` should trigger handoff, not more retries

Best when fairness and predictability matter more than squeezing out one more attempt.

## When `80%` is probably too low or too high

### Too low

If you alert too early, people will ignore it.

Examples:

- tiny budgets where normal startup cost hits `80%` immediately
- workflows that naturally spend most of their budget near the end

Symptom: lots of warnings, no meaningful action.

### Too high

If you alert too late, you lose the chance to correct course.

Examples:

- subagent-heavy workflows where cost ramps quickly
- debugging loops where the last 20% can disappear in minutes

Symptom: the alert arrives after the operator would have wanted to intervene.

## Choosing between daily and per-session caps

Use both if you can.

- **Per-session cap** answers, "Should this single run keep going?"
- **Daily cap** answers, "Can we afford more work today at all?"

A common good default is:

- per-session cap small enough to catch runaway sessions early
- daily cap large enough to allow several normal sessions

## Example operator prompt

```text
Configure a daily budget of $25 and a per-session budget of $5 with alert thresholds at 80 and 100. After that, whenever a cost tool reports budget_alert or hard_capped, tell me whether to continue, trim scope, or stop.
```

## Bottom line

Use `80%` when you want a chance to make a better decision before you are out of room.

Use `100%` when you want the system to treat the run as over-budget and hand control back to a human or a stricter workflow.

If you are unsure, start with `[80, 100]`. It is the simplest setup that gives you both an intervention point and a hard boundary.
