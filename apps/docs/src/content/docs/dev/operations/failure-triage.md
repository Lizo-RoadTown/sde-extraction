---
title: Triaging failures across the deterministic ↔ fuzzy boundary
description: The logic for handling a failure in a system that combines deterministic code with a fuzzy component (an LLM) — by where the fault starts and what it affects. Tool-agnostic.
status: draft
---

This is a **logic piece**, not a procedure. It applies to any system that combines **deterministic
code** (scripts, schemas, parsers, simulators — they do the same thing every time) with a **fuzzy
component** (an LLM — it can vary run to run). It does not depend on any particular orchestrator, with or
without one. The step-by-step for a specific failure is a separate runbook; this page is how to *reason*
about which kind of failure you have.

## The shape of the problem

In a system like this, the fuzzy component is wrapped in deterministic checks. Almost every failure is an
**interaction** between the two: a deterministic part and the fuzzy part affecting each other. So you
triage along two questions: **where did the fault start**, and **what did it affect**.

### Question 1 — where did it start?

- **Reproducible** — the same input fails the same way every run → the source is **deterministic**.
- **Varies** — the same input behaves differently run to run → the source is the **fuzzy component**.

### Question 2 — what did it affect?

- A **deterministic step** threw an error or produced wrong data, or
- the **fuzzy component's output quality** is wrong (it produced the wrong thing, even if nothing crashed).

Cross those two answers:

| started in ↓ \ affected → | a deterministic step | the fuzzy component |
|---|---|---|
| **deterministic** | D→D | D→F |
| **fuzzy** | F→D | F→F |

## The four cases

### D→D — deterministic breaks deterministic
One piece of code breaks another (a schema change breaks a parser; a bad value breaks a calculation).
Reproducible, no fuzziness involved. **Procedure:** ordinary debugging; fix the code, and if a check
should have caught it, add that check so the class can't recur. This is the only case where "just fix
the bug" is the whole answer.

### F→D — the fuzzy output breaks a deterministic step
The fuzzy component returns something a downstream deterministic step can't handle (an invalid value, an
unparseable result). It fails only on certain outputs, so it looks non-reproducible. **Procedure:** the
fault is in the **seam between them**, not the deterministic step's logic. That seam must *reject* the bad
output honestly — return a clear "absent / failed", never crash and never pass it on. Fix by
**constraining the fuzzy component** (tighten what it's allowed to return) and **hardening the seam** —
never by loosening the check so the bad output slips through.

### D→F — a deterministic step feeds bad input to the fuzzy component
The fuzzy component's output is wrong, but the component is fine — it was handed the wrong input (the
wrong source material, missing context). **Procedure:** the fault is **upstream**, not in the fuzzy
component. Fix the deterministic step that prepares the input, and add a check on **the input** so a bad
one is caught before the fuzzy component ever sees it. Do not try to fix this by pushing the fuzzy
component harder — the input is wrong.

### F→F — one fuzzy step degrades another
Two fuzzy steps in a row, where the first's output becomes the second's input, and the error compounds.
**Procedure:** there must never be a raw fuzzy→fuzzy handoff. Put a **deterministic check between them** —
validate or classify the first step's output before the second step is allowed to use it. A deterministic
seam belongs between every pair of fuzzy steps.

## The rule that runs through all four

**Strengthen the deterministic seam between the layers — never loosen it, and never just trust the fuzzy
component more.** Every fix above adds or tightens a deterministic check; none of them relaxes one. A
verdict or output is only ever set from a real check, never guessed; when something didn't run or can't
be confirmed, the honest answer is "not run" or "absent", not a fabricated result.

Orchestration (whether or not you run the steps through an orchestrator) does not change this. An
orchestrator makes the steps explicit and observable — a deterministic *frame* around the work — but it
never relaxes a seam. The seams are where correctness lives.
