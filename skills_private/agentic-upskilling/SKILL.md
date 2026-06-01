---
name: agentic-upskilling
description: Active practice — observe how the user actually works, identify which skills they invoke repeatedly, and promote those into tools when promotion criteria are met. Each user's tool library grows to reflect THEIR workflow over time. Use continuously, not as a one-shot. Lives at /skills/upskilling on the site (planned). Drives Pillar 2's "Make skills together" surface.
---

# Agentic upskilling

This is **not a concept doc, it's an active project**. Every user of Make_Skills has an agent that learns to work the way THEY work. The mechanism is the steady promotion of skills (markdown wisdom) into tools (callable functions), driven by observation of what they actually do.

The discipline is the same for every user; the content (which skills, which tools, in what order) is unique to each user's workflow.

## The shape of the practice

Three roles in the loop:

| Role | Responsibility |
|------|----------------|
| **The user** | Works naturally — chats, asks for things, runs into recurring needs |
| **The agent** | Observes patterns over time. Notices which skills they invoke 3+ times the same way, which steps they manually repeat, which manual workarounds keep recurring. Surfaces candidates. |
| **The shared interface** (Pillar 2 site page, planned) | Lists candidates, lets the user approve promotions, shows the evolving tool library, tracks which tools are actually getting used vs sitting idle |

Three artifacts that grow over time:

- **The user's skill library** (`skills/`) — wisdom they accumulate
- **The user's tool library** (the `builtin_tools` list at agent build time, plus per-skill tool modules) — functions their agent calls
- **The user's promotion log** — record of what got promoted from skill to tool, when, why

## When promotion is appropriate (the criteria)

A skill becomes a candidate for promotion to a tool when **all** of these are observable:

1. **The skill has been invoked 3+ times** the same way (look in chat history + memory records)
2. **The work inside the skill is mechanical** — same inputs always yield the same/similar outputs
3. **The agent's reading-the-skill-and-following-it has produced errors** (off-by-one in markdown editing, malformed JSON, etc.) that a code path wouldn't make
4. **The output shape is stable** — a string, a list, a status, a file — not "sometimes prose, sometimes a table"
5. **There's an external system to interface with** (DB, file, API) where a function is more honest than instructions

If 2-3 are true: leave it as a skill, observe more, come back.
If all 5 are true: promote.

## When NOT to promote

Skills that teach **judgment** (the right thing to do depends on context the function can't see) stay as skills forever. Examples:

- `agentic-skill-design` — the meta-pattern itself. No function captures "decide what to do."
- `deep-research-pattern` — the topology can vary; different tasks call for different decompositions.
- `web-app-scaffold` — most of the value is the decision loop; the mechanical bits at the end may be tool-extractable but the skill stays.

## The promotion mechanics

When a candidate is approved:

1. **Identify the mechanical sub-function** inside the skill (the "always do this same way" part)
2. **Write it as a `@tool`** under `platform/api/<area>/tools.py` (file structure follows the area: memory, roadmap, etc.)
3. **Wire it into `builtin_tools`** in `platform/api/agent.py`
4. **Update the skill** — replace prose like "edit the markdown table row by..." with "call `update_roadmap_status(...)` for table edits". The skill's WISDOM stays; its MECHANICS reference the tool.
5. **Add tests in both modes** — per the two-mode discipline. Self-host (`tenant_id="default"`) AND hosted (synthetic non-default `tenant_id` with isolation verification).
6. **Log the promotion** in the user's promotion log (table TBD in postgres, scoped by `tenant_id`).
7. **Commit** with a message like `Promote <skill-name> → <tool-name>: <why now>`.

## The reverse direction (tools that should regress to skills)

Less common but real. A tool that:

- Hasn't been called in N sessions
- Always gets called with subtly different args (suggesting the "fixed" function isn't the right shape)
- Is tightly coupled to a specific user's workflow (and an open-source contributor wouldn't know how to use it)

...should get **demoted** — kept as a skill (with the function code preserved as a reference script), removed from `builtin_tools`. The skill's wisdom may still be valuable; the function isn't earning its tool slot.

## What this looks like in the current repo

We already have **promoted pairs**:

| Skill | Tool | Why it was right to promote |
|-------|------|------------------------------|
| `roadmap-maintenance` | `update_roadmap_status`, `add_roadmap_item`, `roadmap_overview` | Markdown table editing — agents miscount pipes; functions don't |
| (memory pattern, embedded in `lessons-learned`) | `recall`, `query_db` | DB / vector queries — pure I/O |

**Promotion candidates currently visible:**

| Skill | Candidate tool | Trigger criteria status |
|-------|----------------|------------------------|
| `document-parsing` | `parse_document(path, mode)` | API shape already specified in the skill; LlamaParse wiring is one Edit + one import. ✓ on criteria 1, 2, 4, 5; needs 3 verified by use |
| `lessons-learned` | `extract_records_from_transcript(path)` | The script `backfill-claude-code.py` already exists — promoting it to a callable tool is a small wrap. ✓ on 1, 2, 4, 5 |
| `eval-deep-research` | `run_drb_eval(jsonl_path)` | Mechanical once DRB is cloned; ✓ on 2, 4, 5; criteria 1 needs an actual eval run |

These don't have to be promoted today. They're listed so the user (or the agent observing) knows what's queued.

## How the agent participates

The agent calls this skill **after each work session** (or when invoked explicitly). Output is a short report:

```
Skills invoked this session:
  - documentation       (1 use)
  - roadmap-maintenance (3 uses) — promoted to tools already
  - web-app-scaffold    (1 use)

Tools called this session:
  - update_roadmap_status (3)
  - recall                (8)
  - query_db              (1)

Promotion candidates:
  - <none new this session>

Demotion candidates:
  - <tool X> — not called in 4 sessions; investigate

Recommendations:
  - <none>
```

## The eventual Pillar 2 page

`/skills/upskilling` (planned) — same interface for every user, content unique to each:

- **Skill library** with usage counts (your skills, sorted by recency / use)
- **Tool library** with usage counts (your tools)
- **Promotion candidates** — skill rows with "Promote" buttons
- **Demotion candidates** — tool rows with "Demote / Investigate" buttons
- **Promotion log** — historical record of decisions
- **Manual promotion** — paste a skill name, click promote, the agent generates the tool file with two-mode tests

The user's natural workflow IS the input. They don't have to think "should I promote this?" — they just keep working, and the page surfaces the candidates.

## Two-mode discipline

This skill must work in both deployment modes:

- **Self-host:** the user's skills/tools/promotions are local. Promotion log lives in their postgres. The page reads their own data.
- **Hosted-multitenant:** every read/write is `tenant_id`-scoped. Two tenants with the same skill don't share each other's promotion candidates or tool libraries. (Future: opt-in publishing of promoted tools to a shared library.)

The skill itself (this `SKILL.md`) is platform code — same wisdom for every user.

## Anti-patterns

- **Premature promotion.** Skill used once, agent decides to promote. Wastes the user's review attention.
- **Speculative promotion.** Promoting because "it might be useful as a tool someday" without 3+ uses of evidence.
- **Bulk-promote.** Surfacing 10 candidates at once — review fatigue, low signal. Surface 1-2 highest-confidence, let the user pick.
- **Silent promotion.** Agent promotes without showing the user. Always surface; always ask. (Exception: tools the user explicitly asked to add via chat.)
- **Loss of wisdom.** Promoting a skill and DELETING the markdown body. The wisdom stays; the mechanics reference the tool. Always preserve the skill text, even after promotion.

## See also

- [`agentic-skill-design`](../agentic-skill-design/SKILL.md) — the parent meta-skill; this skill is its operational counterpart for skill→tool growth
- [`lessons-learned`](../lessons-learned/SKILL.md) — overlaps in observing user patterns; the lessons-learned pass should flag promotion candidates as a side effect
- [`roadmap-maintenance`](../roadmap-maintenance/SKILL.md) — the canonical example of a successfully-promoted skill+tool pair
- ROADMAP.md (per-tenant, gitignored) — has Pillar 2 entry tracking the active project status

## Pair with the public stack

The promotion-criteria evidence (3+ invocations, mechanical, stable shape) lives in the agent's observability layer. Use these to gather it:

- **`episodic-memory:remembering-conversations`** — search transcripts for repeated skill invocations; produces the "N uses" count
- **`antigravity-bundle-llm-application-developer:langfuse`** — tool-call telemetry; surfaces "promoted tool called K times this week" or "tool not called in N sessions" (demotion signal)
- **`superpowers:writing-skills`** — when authoring the markdown skill that accompanies a newly-promoted tool
- **`antigravity-bundle-qa-testing:test-driven-development`** — write the two-mode tests before flipping the tool into `builtin_tools`
