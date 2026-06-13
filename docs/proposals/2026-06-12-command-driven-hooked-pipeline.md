# Proposal — command-driven, minimal-LLM, hooked extraction pipeline

**Status:** PROPOSED — awaiting Liz's approval before building.
**Date:** 2026-06-12
**Author:** Claude Opus 4.8 (Claude Code), from Liz's architecture direction (this session).
**Surface:** runtime — `services/extraction/` (the worker/pipeline) + `schema.py` (source of truth).
**Relates to:** docs/superpowers/specs/2026-06-12-validation-points-map.md (the gates),
2026-06-12-figure-anchored-schema.md (the schema). This proposal is the WORKFLOW layer that
wires those together. Reconcile with the pending proves+deepagents background research when it lands.

## The problem (Liz)

Right now the worker does everything in one OpenAI call, and intake placeholders ("(auto)") leak
into result columns. That reads as "things all over the place": the figure isn't cleanly threaded
through, the LLM is asked to do more than it should, and there are no per-stage hooks. The fix is a
coherent, wired pipeline.

## Principles (Liz, verbatim intent)

1. **Commands, not values.** A job carries *commands* describing intent — e.g. `figure: "auto"` is a
   command meaning "an agent must choose the figure," NOT a value. Result columns hold the *real
   produced value* (the chosen figure, "Fig. 1"), never the command literal. Auto and outcome are not
   opposites — you can automatically find the figure of the outcome you want to reproduce.
2. **Minimal LLM surface.** The extractor/detector does ONLY what needs reading and judgment. Reduce
   what the LLM must do; **let deterministic hooks/scripts fill in everything that can be done with
   precision.** Fewer LLM responsibilities = fewer places to hallucinate = more trust.
3. **Single-purpose stages, each with a hook.** Every concern is its own script/agent, wired to
   `schema.py` and the validation-points map; each emits its validation/telemetry event (a hook).
4. **The worker is a thin loop.** Claim a job, run the orchestrator, sleep. No domain logic in it.

## The pipeline (stages)

```
paper in
  → Figure DETECTOR (FIRST)   SCRIPT · scan the snapshot for figure captions → list every figure
                              ({label, caption, page}). DISPLAY them before anything else, so the
                              user knows what to choose. Deterministic (no LLM) where possible.
  → CHOICE                    user picks a figure  OR  command = auto → a tiny chooser picks one
                              (the result records the REAL figure, never "auto").
job (carries the chosen figure as a COMMAND)
  → Orchestrator        reads commands, routes, spawns only the stages needed (deepagents)
    → Extractor         LLM · given the chosen figure, extract present/absent machinery (verbatim)
    → Validator         mostly SCRIPTS · lineage re-hash + schema + (2nd-model cross-check)
    → Storage           SCRIPT · write to staging w/ lineage; promote to final on the human verdict
```

**Stage 1 is figures-first.** Nothing extracts until the figures are surfaced and one is chosen —
otherwise the user has nothing to choose from. The detector runs the moment a paper lands.

### LLM does the minimum
- **Figure-chooser** (only on the `auto` command): returns which figure ("Fig. 1") + why. Nothing else.
- **Extractor**: given the figure, returns present/absent slots with **verbatim quotes**. It does NOT
  compute hashes, offsets, units conversions, or derived fields.
- **(optional) Validator cross-check**: a *second* model judges agreement — the only other LLM call.

### Deterministic hooks/scripts do everything precise (no LLM)
- **checksum hook** — SHA-256 each present quote (`checksums_for`, exists). [V-lineage]
- **lineage hook** — locate each quote's offset/position in the snapshot text, re-hash, verify. [V6]
- **licence / snapshot / schema scripts** — Crossref licence (V2), served_sha256 (V3), Pydantic
  conformance (V5). Fixed pass/fail, no judgment.
- **figure-repro script** — when the engine can regenerate the figure (V7).
- **derive/format hooks** — any field computable from what's present (e.g. normalize, tag) done by code.

### Hooks = the wiring
Each stage, on firing, emits a **hook event**: `{point, subject(agent|script + version), outcome,
latency, lineage_ref, tags}` → `validation_events` (+ OTel→loom). This is the telemetry we mapped;
it's what makes Agent Health / Extraction Health real (today they're sample/derived). "Each thing
carefully wired to this script, with hooks" = this.

## Commands (the job's intent), examples
- `{figure: "auto"}` → run Figure-chooser, then Extractor on its choice.
- `{figure: "Figure 2"}` → skip Figure-chooser; Extractor targets Figure 2.
- `{mode: "whole"}` → Extractor over every figure (loops the chooser).
The column that records the *result* always holds the real figure, never the command.

## Staging (Liz, earlier) — for fetched items
Fetched (DOI) items land in the DB **with full lineage** in a **staging** state, validated by the
script hooks, then enter the queue → human verdict (V8) → promoted to final storage. Walkthrough/Bulk
lanes already separate (migration 0004); staging is the validator→storage handoff.

## What changes vs today
- `worker.py` shrinks to: claim → `orchestrator.run(job)` → mark done. Domain logic leaves it.
- `processor.py` splits into `figure_chooser.py` (LLM, conditional) + `extractor.py` (LLM) + the
  deterministic hook scripts. `schema.py` stays the single source of truth.
- New `validation_events` table + a tiny `hook(event)` helper every stage calls.
- Orchestrator built on deepagents (pending research) or a plain function pipeline if deepagents is a
  poor fit for a long-running poll-worker (the research will say).

## Build order (incremental, each shippable)
1. **Extract the deterministic hooks out of the one big call** — checksum + lineage as explicit
   scripts with a `hook()` emitting `validation_events`. (Reduces LLM surface immediately; real telemetry.)
2. **Split Figure-chooser from Extractor** — "auto" becomes a command that runs the chooser; the
   Extractor receives a real figure. (Threads the figure cleanly; stops "(auto)" at the source.)
3. **Orchestrator** wraps the stages (deepagents or plain pipeline per research).
4. **Validator (two-model + scripts) + Storage staging.**
5. **Agent/Extraction Health read real `validation_events`** (replace sample/derived).

## Out of scope (now)
The confidence compute (separate pillar). The actual DOI-snapshot fetch (designed, not built) — its
own stage when built.
