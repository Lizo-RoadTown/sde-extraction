---
title: "ADR 0007: The schema change path"
description: How the schema is created and modified — governed, not whatever-goes.
---

**Status:** Accepted · **Date:** 2026-06-16

## Context

The schema is the spine of this project (ADR 0001 — OpenAI + Pydantic): the model is *forced* to
fill it, so the schema decides what gets extracted and how. There are two layers, both Pydantic:

- **Extraction schema** — `services/extraction/schema.py` (`FigureExtraction`, `Variable`,
  `Parameter`, `Term`, the present/absent `Slot`). The shape of the answer.
- **Classification schema** — `services/extraction/classification.py` (the family / variable-role
  / parameter-role registries + the `*Classification` models). What things *are*, so the model
  fills the extraction schema correctly instead of grabbing "all thousand parameters."

A change to either ran with **no path**: on 2026-06-14 an edit referencing a schema name that
didn't exist (`FigurePanels`) was committed untested and **crash-looped the worker for two days**
(jobs stuck at `queued`). An ungoverned schema change took the whole pipeline down silently. This
ADR defines the path so that cannot recur.

## Decision — the path every schema change follows

1. **One source of truth.** The shape lives only in `schema.py` + `classification.py`. No module
   references a schema name not defined there. The TypeScript mirror the dashboard consumes is
   **generated** from the Pydantic models (via JSON Schema → `pydantic-to-typescript` /
   `datamodel-code-generator`), never hand-maintained — so producer (worker) and consumer
   (dashboard) cannot silently drift. (Hand-sync drift already bit us once: the snake_case vs
   camelCase `rowToExtraction` bug.)
2. **Propose + classify the change.** A short note: which field/role, why, is it a present/absent
   *value* or an *identification* label, and is it **backward-compatible or breaking**
   (Confluent's framing). Breaking changes require step 3 + a migration.
3. **Approval gate.** Schema changes are Liz's to approve — the `LIZ-APPROVED REVISION` /
   `UNDER REVIEW` status tags in `schema.py` stay honest. Clear ownership; explicit approval for
   breaking changes.
4. **Deterministic guard (the piece that was missing).** `scripts/check_schema.py` must pass
   before commit/deploy: it **imports every module** (catches a `FigurePanels`-class bad name
   instantly), **constructs each Pydantic model + loads each registry**, and asserts the
   **producer↔consumer contract** (the generated TS matches `schema.py`). No green check → no
   ship. This shifts breakage left — caught in development, not in production.
5. **Expand–contract migrations.** When the stored shape changes, migrate in safe phases:
   **expand** (add new, optional, with defaults — additive `000N` migration), **migrate** (move
   data/logic over), **contract** (remove the old only after nothing uses it). New fields are
   always optional first; deprecate before delete. Never a breaking in-place change.
6. **Docs in the same commit; registry growth via HITL.** The relevant doc page updates alongside
   the change (this site). Adding a new family/variable-role/parameter-role is **not** a code edit
   — it goes through the classification-candidate HITL track (a human verifies it against a real
   paper before it enters the registry).

## Consequences

- The `FigurePanels` failure mode is structurally prevented: step 4 fails loudly on any undefined
  schema reference before it can deploy.
- Producer/consumer drift is prevented by generation (step 1) rather than vigilance.
- Schema evolution is safe-by-construction (expand–contract), so a change can't strand stored data.
- Cost: a codegen step + a guard script to maintain. Justified — the alternative is silent
  production breakage, which we have already paid for.

## Research basis

Validated against established practice: schema-evolution governance + expand–contract
([Confluent schema evolution](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html);
[expand-and-contract](https://medium.com/@jasminfluri/expand-and-contract-method-for-database-changes-414d236f236f)),
consumer-driven contract testing (shift breakage left; producer/consumer agreement —
[Pact CDC](https://github.com/filipsnastins/consumer-driven-contract-testing-with-pact)), and
Pydantic→TypeScript single-source codegen
([pydantic-to-typescript](https://github.com/phillipdupuis/pydantic-to-typescript)).
