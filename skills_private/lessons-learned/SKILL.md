---
name: lessons-learned
description: Walk back through prior chat transcripts to find systematic friction patterns (misunderstandings, recurring info needs, negotiations, user corrections), then crystallize them into intake forms (skills/<topic>/intake.md) and memory updates so future invocations of recurring tasks need fewer round-trips. Use when the user wants the system to "get sharper" or after a long working session.
---

# Lessons learned (transcript → intake forms + memory)

Reviews past chats systematically and produces structured artifacts so the system needs fewer questions next time.

**Outputs (in order of value):**

1. **Intake forms** at `skills/<topic>/intake.md` — structured "here's what to probe / assume / actually ask / save" per recurring task type. Skills LOAD these to skip the asking-questions step.
2. **Feedback memory** at `~/.claude/projects/.../memory/feedback_*.md` — corrections and validated approaches the user gave during the session.
3. **Project / user memory** — non-obvious facts about the user, repo, or external systems referenced.
4. **New skill candidates** — patterns that recurred enough to deserve their own skill.

Operate as PROBE → DECIDE → ACT → REPORT. Per [`agentic-skill-design`](../agentic-skill-design/SKILL.md).

## Probe

| What | How |
|------|-----|
| Recent transcripts | Claude Code transcripts on Windows: search `~/AppData/Roaming/Code/User/globalStorage/anthropic.claude-code/` and `~/.claude/projects/` for JSONL files. On macOS/Linux: similar paths. |
| Current conversation | Already in context — process this directly. |
| Existing memory | Read every file under `~/.claude/projects/<repo>/memory/` |
| Existing skills + intake forms | `find skills -name "intake.md" -o -name "SKILL.md"` |
| Repo state | What was actually built, committed, deployed |

## Decide

For each friction-point cluster found, route to the right artifact:

| Pattern observed | Output |
|-----------------|--------|
| User had to repeat the same context (preferences, domain, account, tooling) every time a topic came up | New intake form `skills/<topic>/intake.md` |
| User corrected your behavior ("stop doing X", "don't ask, just do Y") | `feedback_*.md` memory |
| User validated an unusual choice ("yes, that's right" on a non-obvious decision) | `feedback_*.md` memory (validated approaches matter as much as corrections) |
| Background fact about user / their work / their stack | `user_*.md` or `project_*.md` memory |
| External system referenced repeatedly | `reference_*.md` memory |
| Same multi-step task came up multiple times | New skill candidate — note in report |
| One-off question, won't recur | Skip |

## Act

For each cluster:

1. **Intake form** → write to `skills/<topic>/intake.md` using the schema below.
2. **Memory entry** → write the file under `memory/` and add a one-line entry to `MEMORY.md`.
3. **New skill candidate** → DON'T auto-create. Note in the report. Let the user say "yes, formalize that" because new skills imply ongoing maintenance.
4. **Cross-links** — every intake form links back to its parent SKILL.md; every memory entry that supersedes earlier guidance edits the earlier one.

## Stop conditions

- No transcripts accessible (e.g., Claude Code stores them in a path the agent can't reach) → report what's missing, work from what IS available (current conversation, memory).
- More than ~10 candidate intake forms → likely over-fitting; consolidate or pick the top 3.
- Friction with someone OTHER than the user (e.g., a teammate's transcript) → don't include — privacy boundary.

## Report

```
Reviewed: <N transcripts | current conversation | date range>

New intake forms (N):
- skills/<topic>/intake.md — triggers: <phrases>; captures: <fields>

New / updated memory (N):
- feedback_<X>.md — <one-line>
- ...

Skill candidates (not auto-created — say "formalize <name>" to create):
- <pattern>: seen <N> times; would cover <X>

One-offs skipped: <count>
```

## Intake form schema

Every `skills/<topic>/intake.md` follows this exact YAML-headed structure so other skills can parse it programmatically:

```markdown
---
name: intake-<topic>
applies_to_skill: <parent skill name>
trigger_phrases:
  - "I want X on my website"
  - "hook this up to my domain"
  - "..."
---

# Intake — <topic>

## Probe (do these before deciding)
- <command or file to read>: <what info it yields>
- ...

## Defaults (assume unless probe disconfirms)
| Field | Default | Disconfirm if |
|-------|---------|---------------|
| <key> | <value> | <condition> |

## Genuinely needs user input
- <field>: <when to ask> | <fallback if user defers>

## Capture to memory after success
- <key>: <where to save it>

## Stop conditions specific to this topic
- <condition>: <what to report>
```

The schema is intentionally rigid. Skills that consume intake forms expect this shape.

## When to run

- After a multi-hour collaborative session where new patterns emerged (manual: user asks)
- Periodically as a scheduled background task (via `/schedule`)
- Before starting a new project that overlaps with old territory (catch up the system on what it should already know)

## Cross-cutting: surface skill→tool promotion candidates

When walking transcripts, also note patterns where the user repeatedly invoked the same skill in the same way (3+ times). Those are inputs to the [`agentic-upskilling`](../agentic-upskilling/SKILL.md) practice — flag them in the report's "Promotion candidates" section so the user can decide whether to promote skill → tool.

The output schema gains an optional section:

```
Promotion candidates (skill → tool):
- <skill-name>: invoked N times across M sessions; mechanical sub-step is <description>
```

## See also

- [`agentic-skill-design`](../agentic-skill-design/SKILL.md) — the operating pattern this skill (and the skills it produces) follow.
- [`agentic-upskilling`](../agentic-upskilling/SKILL.md) — the active practice that consumes this skill's "promotion candidates" output.
- [`web-app-scaffold/intake.md`](../web-app-scaffold/intake.md) — first concrete example, extracted from this repo's setup conversation.

## Pair with the public stack

Transcript probing and pattern crystallization can lean on existing tools:

- **`episodic-memory:remembering-conversations`** — actual transcript search instead of manual JSONL walking; use as the PROBE tool
- **`superpowers:writing-skills`** — when a recurring friction pattern earns its own new skill
- **`antigravity-bundle-essentials:kaizen`** — continuous-improvement framing for the patterns that don't deserve a full skill but should change behavior
- **`antigravity-bundle-llm-application-developer:langfuse`** — for friction patterns that surface in agent telemetry (high turn count, retry loops, tool errors)
