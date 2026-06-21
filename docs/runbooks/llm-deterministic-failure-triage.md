---
title: "Runbook: triaging failures across the deterministic ↔ LLM boundary"
description: How to tell where a failure originates, what it affects, and the procedure for each case — deterministic vs LLM, in all four combinations.
date: 2026-06-20
---

# Triaging failures across the deterministic ↔ LLM boundary

This system is **one fuzzy LLM step wrapped in deterministic machinery**. The LLM (the extraction
brain, `processor.run` — [processor.py:79](../../services/extraction/processor.py#L79)) is a single
node; everything around it — figure detection/isolation, the present/absent schema, the classifier
registries, the locator, the reproduction oracle, the schema guard — is deterministic code whose job is
to constrain and check the LLM.

Because of that shape, almost every failure is an **interaction** between a deterministic part and the
LLM part. This runbook tells you how to triage by **where the fault originates** and **what it affects**,
and what the procedure is for each of the four combinations.

## Governing principles (apply first, every time)

1. **Wrap the one fuzzy LLM with a deterministic check at every seam. Never ship an LLM output no
   script can check.** This is the determinism-web principle. The checks already in place are listed in
   [§ The deterministic seams](#the-deterministic-seams-we-have).
2. **Confine the LLM to one step.** Everything else is deterministic and observable. If you find LLM
   judgment leaking into a step that should be deterministic, that is itself the bug.
3. **A verdict/output is only ever set from a real deterministic check, never guessed.** See the
   two-part reproduction verdict, [transform.py `decide()`](../../services/extraction/transform.py#L102):
   a run that errored is `failed`, a run that never happened is `not_run` — never collapsed into a guess.
4. **The fix is almost always to strengthen the deterministic seam, not to loosen it.** When the LLM
   produces something bad, harden the gate that catches it and constrain the LLM (prompt/schema) — do
   not relax the check so the bad output passes.

## How to triage any failure (decision flow)

1. **Is it reproducible across runs with the same input?**
   - Reproducible, identical every run → the source is **deterministic** (code/workflow).
   - Varies run to run on the same input → the source is the **LLM**.
2. **What actually broke?**
   - A deterministic step threw / produced wrong data → the effect is **deterministic**.
   - The model's *content* is wrong (wrong figure read, hallucinated value, missed variable) → the
     effect is **LLM-quality**.
3. Cross those two answers in the table below, go to that quadrant, follow the procedure.

## The 2×2: source → effect

Rows = **where the fault originates**. Columns = **what it affects**.

| source ↓ \ affects → | Deterministic step | LLM step |
|---|---|---|
| **Deterministic** | D→D (code breaks code) | D→L (bad input degrades the model) |
| **LLM** | L→D (model output breaks code) | L→L (model output degrades another model) |

### D→D — a deterministic step breaks another deterministic step

- **Signature:** a reproducible exception or wrong data, identical every run; no LLM involved (e.g. a
  schema change breaks the parser; a wrong bbox breaks figure isolation).
- **Where to look:** the code itself. This is ordinary debugging.
- **Procedure:** fix the code; the **schema guard**
  ([scripts/check_schema.py](../../scripts/check_schema.py)) and the typed seams should have caught it —
  if they didn't, add the missing deterministic check so this class can't recur. This is the only
  quadrant where "just fix the bug" is the whole answer.

### L→D — the LLM's output breaks a downstream deterministic step

- **Signature:** a deterministic step errors **only on certain LLM outputs**; not reproducible across
  runs because the LLM varies (e.g. the model returns a value the schema rejects, or an executable term
  the oracle can't run).
- **Where to look:** the **seam between the LLM and the deterministic step** — not the deterministic
  step's logic.
- **Procedure:** the seam must **reject the bad output honestly, not crash or propagate it.** The
  present/absent schema ([schema.py](../../services/extraction/schema.py)) forces the model into
  checkable slots; the classifier gate
  ([classification.py `match_role`](../../services/extraction/classification.py#L398)) validates the
  role against the registry; the oracle records `failed`/`not_run` rather than a fake verdict
  ([oracle.py](../../services/extraction/oracle.py)). Fix by **constraining the LLM** (prompt/schema)
  and **hardening the gate** — never by loosening the check so the bad output slips through.

### D→L — a deterministic step feeds bad input to the LLM and degrades it

- **Signature:** the model output is wrong or empty, but the model itself is fine — it was given the
  wrong input (e.g. the wrong figure was isolated, so the LLM read the wrong panel; missing context).
  Reproducible if you fix the deterministic input.
- **Where to look:** **upstream of the LLM** — detection, isolation, the context assembled for the call.
- **Procedure:** fix the deterministic upstream (figure detection/isolation in
  [figures.py](../../services/extraction/figures.py), the content assembled in
  [processor.py](../../services/extraction/processor.py)). Add a deterministic check on **the input to
  the LLM** (e.g. the dual-SHA-256 provenance of the isolated figure) so a bad input is caught before
  the model ever sees it. Do not try to fix this by prompting the LLM harder — the input is wrong.

### L→L — one LLM step's output degrades another LLM step

- **Signature:** two LLM steps in sequence; non-reproducible; the error compounds (one model's bad
  output becomes another model's bad input). Today the system has only one LLM step, so this appears
  only when a multi-step agentic extraction is introduced (e.g. per-variable sub-agents).
- **Where to look:** **the gap between the two LLM steps** — there must not be a raw LLM→LLM handoff.
- **Procedure:** insert a **deterministic check between them.** The first model's output is validated /
  classified (the present/absent gate, the classifier registries) **before** it reaches the second
  model. This is the determinism-web rule applied to agent chains: never let one fuzzy step feed another
  fuzzy step unchecked — put a deterministic seam between every pair.

## The deterministic seams we have

These are the checks that turn "trust the LLM" into "verify the LLM." When triaging an L→D or L→L
failure, the fix usually lives in one of these:

| Seam | What it checks | Where |
|---|---|---|
| Present/absent schema | the model can only return checkable slots (quote + page + hash) | [schema.py](../../services/extraction/schema.py) |
| Schema guard (hook) | the schema/contracts still import + construct (blocks a broken schema) | [scripts/check_schema.py](../../scripts/check_schema.py) |
| Classifier registries | the variable/parameter role is a known role, or routed to the candidate HITL track | [classification.py:398](../../services/extraction/classification.py#L398) |
| Locator | each present quote is verbatim and pinned to a real PDF rect | [locator.py](../../services/extraction/locator.py) |
| Recorded transformation | how each term was lifted is recorded, step by step | [transform.py](../../services/extraction/transform.py) |
| Reproduction oracle | re-simulate twice at a fixed seed; same result = reproduced (two-part verdict) | [oracle.py](../../services/extraction/oracle.py), [transform.py:102](../../services/extraction/transform.py#L102) |
| Telemetry seams | every stage emits a `validation_event` (the observability spine) | [hooks.py](../../services/extraction/hooks.py) |

## Where orchestration fits (Dagster vs an agent framework)

The orchestration layer (whether the pipeline runs as a direct call or through Dagster —
[dagster_flow.py](../../services/extraction/dagster_flow.py), switched by `EXTRACTION_ENGINE`) is a
**deterministic frame**: it makes the steps explicit, observable, and retriable, and confines the LLM to
one node. It does **not** change the brain. An agent framework (e.g. LangGraph) would only enter **inside
the one LLM node** if the extraction itself became multi-step agentic — and even then, the L→L rule
applies: a deterministic seam between every pair of fuzzy steps. Orchestration choice never relaxes the
seams; it only makes them more visible.

## One-line summary

Triage by **reproducible? (→ deterministic source) vs varies? (→ LLM source)** and **what broke
(deterministic step vs model quality)**; the fix is almost always to **strengthen the deterministic seam
between the layers**, never to loosen it or to trust the LLM further.
