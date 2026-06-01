---
name: orchestration-cataloging
description: Identify recurring work patterns in the user's recent build (research bursts, proposal writing, schema migrations, isolation tests, UI scaffolding, etc.) and recommend turning the high-frequency ones into reusable subagents, skills, or scripts. Use when the user asks "what should I make reusable", "what patterns am I repeating", or after several similar tasks ship in a row. The goal is self-correcting orchestration — the platform gets sharper at the user's actual workflow over time.
---

# Orchestration cataloging

Look at how the user has actually been working — not how a textbook says agents should work — and recommend which recurring patterns deserve to become reusable orchestrations (subagents, skills, scripts). The output is `docs/plans/<YYYY-MM-DD>-orchestration-catalog.md` plus a 3-bullet report.

## Why this exists

The pattern: a user does X by hand the first time, X by hand the second time, then on the third X they think "wait, this should be automatic." This skill catches that signal earlier — by surveying recent commits, conversation patterns, and proposal artifacts, it finds the patterns the user is *already* repeating but hasn't yet captured as reusable.

The fix is one of three:

| Pattern frequency | Solution |
|-------------------|----------|
| Done 5+ times the same way, mechanical | **Tool** — Python `@tool` function the agent can call |
| Done 3-5 times, structured but with judgment | **Subagent** — specialist with persona + skills, delegated to |
| Done 2-3 times, one-shot with variations | **Skill** — markdown wisdom for ad-hoc invocation |
| Done 1-2 times | Don't capture yet — wait for a third run |

This matches the [`agentic-upskilling`](../agentic-upskilling/SKILL.md) skill→tool promotion criteria. Orchestration-cataloging applies the same logic at the orchestrator level.

## When this applies

**Apply when:**
- The user asks "what patterns am I repeating?" / "what should I make reusable?"
- Several similar tasks have shipped in a row (look at git log)
- The user mentions wanting their own dogfooded interface to track the build
- After a major project phase ends, before the next begins

**Skip when:**
- The user is asking what to do next (use [`next-actions-planning`](../next-actions-planning/SKILL.md))
- The user is asking which design to pick (use [`design-evaluation`](../design-evaluation/SKILL.md))
- Less than ~10 commits of recent work to draw from — too little signal

## 1. PROBE — survey recent work

Read these in parallel:

```
git log --oneline -50                          # the actual recent shape
git log --stat -30 | head -200                 # what files keep getting touched
ls subagents/                                  # existing subagents
ls skills/                                     # existing skills
ls scripts/                                    # existing scripts
ls docs/proposals/ docs/plans/ docs/runbooks/  # existing artifacts
grep -r "TODO" platform/ skills/               # things that look like deferred reusable work
```

Plus, scan the recent conversation for repeated phrasing:
- "Let me research this in parallel..." (research-burst pattern)
- "Writing the proposal..." (design-proposal pattern)
- "Migrating the schema..." (schema-migration pattern)
- "Writing isolation tests..." (test-pattern)
- "Wiring this into FastAPI..." (endpoint-scoping pattern)

For each repeated phrase, count occurrences. The count is the frequency signal.

## 2. INVENTORY — what makes a good reusable orchestration

A pattern is *worth* turning into a reusable orchestration when:

- **Cost-saving** — the user spends real time/tokens doing it manually each time
- **Mechanical core** — the variable part is small; most of it is the same shape every time
- **Explicit inputs/outputs** — you can name what goes in and what comes out
- **Stable interface** — the underlying API/CLI/protocol isn't churning monthly
- **Composable** — other orchestrations could call this one

A pattern is *not* worth capturing yet when:

- The variable part is most of the work (judgment-heavy, every run is genuinely different)
- It's been done once or twice and might never recur
- The cost of building the abstraction exceeds 5+ runs of doing it by hand
- The user is still figuring out what they want from the pattern

## 3. DECIDE — score each candidate

For each recurring pattern observed, score on three axes:

| Axis | 1 | 5 |
|------|---|---|
| **Frequency** | done 1-2 times | done 6+ times |
| **Mechanical fit** | every run wildly different | shape repeats exactly |
| **Time-per-run** | minutes | hours |

Recommendation matrix:

| Score (Frequency × Mechanical × Time) | Action |
|---|---|
| ≥ 60 (high all three) | Build a **tool** now — Python function, agent can call directly |
| 30-59 | Build a **subagent** — specialist persona that handles this delegation |
| 15-29 | Author a **skill** — markdown wisdom + decision table |
| < 15 | Park — note the pattern, revisit if it recurs |

Always categorize each pattern explicitly. Don't skip the parking lot — the act of saying "not yet" is a memory the next run benefits from.

## 4. ACT — write the catalog

`docs/plans/<YYYY-MM-DD>-orchestration-catalog.md`:

```markdown
# Orchestration catalog — <date>

## Methodology
Surveyed: <what you read — git log range, proposal count, conversation turns>.
Frequency × Mechanical × Time scoring; threshold at <N> for tool, <M> for subagent, <K> for skill.

## Patterns observed (frequency-ordered)

### 1. <Pattern name> — observed <N> times
- **Where:** <which commits / proposals / conversations>
- **Shape:** <what's the same every time>
- **Variable:** <what changes between runs>
- **Score:** Frequency <X>/5 · Mechanical <X>/5 · Time <X>/5 = <total>
- **Recommendation:** <Tool / Subagent / Skill / Park>
- **Concrete next step:** <"Add `tool_name(args)` to platform/api/tools/X.py" or "Create subagents/<name>/" or "Write skills/<name>/SKILL.md" or "Park; revisit after run #<N+2>">

### 2. <Pattern name> — observed <N> times
…

## What we already have (don't duplicate)
- <existing tool/subagent/skill that already covers a pattern>

## Recommended order to build
1. <highest-impact next reusable to build>
2. <next>
3. <next>

## Parking lot
- <pattern> — wait for run #<N> before capturing
```

## 5. REPORT — three bullets

```
Catalog: docs/plans/<date>-orchestration-catalog.md

Top three to build (in order): <pattern A> (tool), <pattern B> (subagent), <pattern C> (skill).

Park: <count> patterns; the most likely to graduate next is <pattern>.
```

## The self-correcting loop

The point of cataloging is that **invocation N+1 makes fewer manual decisions than invocation N**. Each time a pattern is captured into a reusable orchestration:

1. The user's next ask of that shape gets routed to the orchestration automatically.
2. The orchestration accumulates its own usage data — token cost, time, success rate — visible in `/observability`.
3. The orchestration's `references/preset-*.md` directory grows with successful recipes, making each run faster and more deterministic.

A healthy project trends toward **fewer ad-hoc decisions and more pre-computed orchestrations**. If the orchestration count isn't growing across cataloging passes, that's a signal — either the user's work is genuinely novel each time (rare), or the cataloging skill isn't catching the patterns (more common — improve the probes).

## Recurring categories worth watching for

These tend to recur in any agentic-platform build. If the catalog shows ANY of these, they're prime candidates:

- **Parallel-research bursts** — N independent research questions on a topic, synthesized after. Subagent.
- **Proposal authoring** — same shape every time (problem / decision / schema / phases / open questions). Skill or template.
- **Schema migrations** — Postgres + LanceDB + idempotent runner. Subagent for the design, tool for the runner.
- **Isolation tests** — two-tenant fixture, cross-tenant assertions. Skill (the pattern), generated test fixture (the tool).
- **Endpoint scoping** — `Depends(get_current_tenant)` + helper update + recorder update. Skill.
- **UI scaffolding** — page → form → API client → backend endpoint → test. Subagent.
- **Decision matrices** — multiple options, score, recommend. **This skill's sibling, [`design-evaluation`](../design-evaluation/SKILL.md), exists exactly for this.**

If most of these show up frequently, the user's project is in active build phase and the catalog will be valuable. If few do, the project is in a more exploratory phase and cataloging might be premature.

## Memory loop

After a cataloging pass:

- Save the **count** for each pattern. The next pass starts from these numbers.
- If a pattern was promoted to a tool/subagent/skill, save *which* — so the next pass knows it's done.
- If a pattern keeps showing up but never crosses the threshold, eventually park it permanently — there's a reason it stays manual.

## Reference

- [`agentic-skill-design`](../agentic-skill-design/SKILL.md) — PROBE/DECIDE/ACT/REPORT base pattern
- [`agentic-upskilling`](../agentic-upskilling/SKILL.md) — skill→tool promotion criteria
- [`design-evaluation`](../design-evaluation/SKILL.md) — sibling for "which design"
- [`next-actions-planning`](../next-actions-planning/SKILL.md) — sibling for "what next"

## Pair with the public stack

Pattern detection benefits from real telemetry, not just git-log scrolling:

- **`episodic-memory:remembering-conversations`** — surface repeated work patterns across sessions
- **`antigravity-bundle-llm-application-developer:langfuse`** — tool-call frequency, the strongest signal for "make this reusable"
- **`superpowers:dispatching-parallel-agents`** — when the recurring pattern is parallelizable (the cataloged work should become a parallel-agent dispatch, not a single agent)
- **`antigravity-bundle-essentials:kaizen`** — continuous-improvement framing when patterns aren't yet at promotion threshold but should shape behavior
