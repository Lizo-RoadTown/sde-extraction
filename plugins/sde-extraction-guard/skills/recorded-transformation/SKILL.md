---
name: recorded-transformation
description: Use when building or changing how data is transformed in SDE_Extraction — e.g. lifting a term off the page into the executable BioModels curation model, or wiring the reproduction oracle. Every transformation stage must be recorded and observable; never a black box, never a guessed verdict.
---

# Recorded transformation

Any transformation of data in this repo must capture **how** it happens, stage by stage — not just emit a result. This is the determinism-web + observability-spine made into a build discipline.

## The rule

1. **Lift** the source verbatim, with provenance — quote, page, hash (`schema.Term.expression` Slot).
2. **Transform** through **classified** operations — the `TRANSFORMATIONS` registry in `classification.py`. Record `before → operation(s) → after`, both hashed (`transform.TermTransform`). A new operation goes through the candidate HITL track (`value_is_new` / `is_new`), never silently.
3. **Run the real tool** — the BioModels curation model / diffrax harness. Never invent a substitute; never let the LLM judge geometry or reproducibility.
4. **Check deterministically** — the verdict (e.g. `figure_reproduced`) is set ONLY after the real check runs. The curation model is deterministic (fixed seed), so *same results each time = reproduced*. Never guess the verdict.
5. **Record every stage** — each emits a `validation_events` seam (observability spine) and lands in one kept record (`transform.ReproductionRecord`).

## Forbidden

- A black-box transformation that emits pass/fail with no recorded steps.
- A verdict asserted before the deterministic check runs (e.g. "could not be reproduced" with no run — the exact bug fixed in commit eee7747).
- Inventing a tool or heuristic when a real one is specified (use the curation model; humans choose; nothing fake).

## Where it lives

`services/extraction/transform.py` (the record shapes), `classification.py` (TRANSFORMATIONS), `facets.py` (per-piece metatags). Memory: `reproduction-transformation-must-be-recorded`, `biomodels-curation-template-is-the-repro-oracle`.
