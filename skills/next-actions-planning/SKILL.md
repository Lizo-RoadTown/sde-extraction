---
name: next-actions-planning
description: Produce a grounded "what to do next" plan for the project — based on what shipped, what's open, what blocks what, and what the user has signaled they care about. Use when the user asks "what's next?" or after a major piece of work lands. Probes the repo, scores candidates, writes a plan file, returns a 3-bullet recommendation.
---

# Next-actions planning

Generate a concrete, prioritized plan for what to work on next. The plan is grounded in **actual repo state** — not aspirational, not invented from training data — and routed through the agentic-skill-design pattern (PROBE → INVENTORY → DECIDE → ACT → REPORT).

The output is a plan file at `docs/plans/<YYYY-MM-DD>-next-actions.md` plus a short report. The user picks one and either says "go" (execute autonomously) or says "discuss first" (start a design conversation).

## 1. PROBE — what is currently true

Read these in parallel before deciding anything. Cheap to do, expensive to skip.

```
git log --oneline -20                          # what just shipped
git status                                     # what's in flight locally
git diff --stat HEAD~5..HEAD                   # the shape of recent work
ls docs/proposals/                             # open design proposals
ls docs/plans/                                 # prior plans (don't redo recent work)
cat ROADMAP.md                                 # current status legend
gh pr list --limit 10  (if available)          # in-flight PRs
gh issue list --limit 10  (if available)       # open issues
```

Plus, read in parallel:

- The most recent 1-2 plan files in `docs/plans/` if they exist — pick up where the last one left off
- The "Open questions" / "Open work" sections of every proposal in `docs/proposals/`
- The last 20 user messages in the conversation (the conversation itself is a probe — what has the user said they want?)
- `recall(query="next priorities", limit=10)` — semantic memory for prior preference signals

Treat the user's recent messages as the strongest signal. If they said "let's do X next" three turns ago, X is probably the answer regardless of what the roadmap says.

## 2. INVENTORY — what tools/agents are available

Before planning anything that requires research or careful reasoning:

| Need | Tool to use |
|------|-------------|
| Multiple parallel research questions on unfamiliar topics | spawn N general-purpose Agents in parallel, each on one focused question |
| Codebase-wide "where is X" | Explore agent |
| Architectural reasoning before writing code | Plan agent |
| Live library docs | Context7 MCP |
| Hosting/infra check (Vercel, Render) | direct CLI / vercel/render skills |
| Schedule a follow-up | `/schedule` skill (cron-based recurring or one-time) |
| Loop on a recurring check | `/loop` skill |

**Always prefer parallel research for unfamiliar territory.** A single research agent serializes what could be done in 2 minutes across four parallel agents.

## 3. DECIDE — score every candidate

For each candidate task, score on three axes:

| Axis | Question | Weight |
|------|----------|--------|
| **Blocking** | Does shipping this unblock other work? | High — pick blockers first |
| **User-pull** | Has the user signaled they want this *now* (recent message, recent edit, ROADMAP priority)? | High — match revealed preference |
| **Effort** | Is it hours, days, or weeks? | Inverse — quick wins beat big bets when both score equal |

Categorize each candidate into exactly one bucket:

- **Ready to execute** — no design conversation needed. Auto-mode-eligible.
- **Needs decision** — one specific question to the user, then ready. Spell out the question in the plan.
- **Blocked on a prior decision** — waiting on something currently in another bucket. Note the dependency.
- **Speculative / not yet** — interesting but not ripe. Park.

Rules of thumb:

- A blocker beats a non-blocker even if the blocker has higher effort.
- User-pull beats roadmap order. The roadmap is months old; the conversation is now.
- If two candidates tie, pick the one with smaller effort.
- Never pick a "speculative" item as the top recommendation.

## 4. ACT — write the plan file

Write `docs/plans/<YYYY-MM-DD>-next-actions.md` with this exact shape:

```markdown
# Next actions — <date>

## What just shipped
<1-2 sentences summarizing the most recent significant work, with commit SHA references>

## Top recommendation
**<concrete action>** — <one-sentence why>

Effort: <hours/days/weeks>. Blocks: <what this unblocks>. Pull: <what user signal this matches>.

## Other ready-to-execute options (pick one)
1. **<option>** — <why> — effort: <…>
2. **<option>** — <why> — effort: <…>

## Needs a decision before starting
- **<topic>** — open question: "<exact question for the user>". Affects: <what depends on this>.

## Blocked on prior decisions
- **<topic>** — waiting on: <which decision above>

## Parking lot (do not start)
- <topic> — <why parked>

## Cross-references
- Proposal: <path>
- Recent commit: <sha>
- Conversation signal: "<quoted user line>"
```

Plan files are append-only history. Never edit a prior plan; write a fresh one. The dated filename means the next planning pass can read what was decided last time.

If a candidate task **also** needs a design proposal (research is required before code), write the proposal stub into `docs/proposals/` and link to it from the plan. Don't do the research inside the plan — that's the proposal's job.

If a candidate task **also** needs a future check-in (e.g., "verify auth provider was chosen in 2 weeks"), call `/schedule` to register a one-time agent for it.

## 5. STOP CONDITIONS

Stop and ask the user only when:

- **Two top candidates tie** on every axis and the choice is genuinely a values call ("polish UX vs add capability").
- **A specific decision is missing** that the planning pass identified — name it clearly, ask once, don't list five questions.

Do NOT stop to ask:

- "Want me to write the plan?" (yes — that's the skill)
- "Should I include X?" (decide based on the rules above)
- "Which format do you prefer?" (the format is fixed in this skill)

## 6. REPORT — three bullets

After writing the plan file, return exactly:

```
Plan: docs/plans/<date>-next-actions.md

Top: **<action>** — <one-line why>

Other options: <2-3 word names of the alternatives>. Decisions needed: <count, or "none">.

Want me to execute the top one? Say "go" or pick a different option.
```

That's the entire response. The plan file holds the detail; the report points at it.

## When this skill applies vs when it doesn't

**Apply when:**
- The user asks "what's next" / "what should I do" / "give me priorities"
- A major piece of work just shipped and the natural follow-up is unclear
- You've been working autonomously and need to checkpoint with the user

**Skip when:**
- The user has already asked for a specific task — just do that task
- The task is obvious from the conversation (one-line answer, not a plan)
- A plan was written within the last 24 hours and nothing material has shipped since — re-read the existing plan, don't author a new one

## Memory loop

After a planning pass, save signals back to memory:

- If the user picked something other than the top recommendation, record *why* — the rule that produced the wrong top choice needs adjusting.
- If a candidate keeps appearing across multiple planning passes without being picked, demote it to the parking lot permanently.
- If a "needs decision" item is repeatedly deferred, the project may not actually need it — flag for the user to consider parking the whole branch.

## Reference

- [`agentic-skill-design`](../agentic-skill-design/SKILL.md) — the PROBE → DECIDE → ACT → REPORT pattern this skill instantiates
- [`roadmap-maintenance`](../roadmap-maintenance/SKILL.md) — the source of truth this skill reads, but does not write to (planning is a separate artifact from the roadmap)

## Pair with the public stack

This skill picks WHAT to do next. For the HOW once a candidate is chosen:

- **`antigravity-bundle-essentials:concise-planning`** — distillation rules for the plan's "next 3 things"
- **`superpowers:writing-plans`** — when the chosen next-action is itself a multi-step plan that needs its own session
- **`superpowers:executing-plans`** — when handing a written plan off to execution
- **`superpowers:brainstorming`** — when the PROBE step turns up nothing strong; widen the candidate set before scoring
