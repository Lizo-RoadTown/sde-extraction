---
title: "The Document-Architecture Constraint — governing canon for SDE extraction"
status: AGENT DRAFT — transcribed from Liz's spoken contribution, awaiting her validation
type: research canon / ontology principle
authored_by: Liz Osborn (intellectual contribution; concept, framing, and the load-bearing rule)
transcribed_by: dev agent (Claude Code) — wording put to page by the agent, idea is Liz's
date: 2026-06-05
human_input: >
  Liz articulated this approach verbally in conversation on 2026-06-05. This file is the agent's
  transcription of her idea for her to check, correct, and promote to Human validated/. The
  promotion is the documented act of her authorship.
validated_by: (pending — Liz)
validation_notes: (none yet)
supersedes_partially: >
  Earlier agent suggestions (TermKind enum + diffusion_matches_family structural validators) assumed
  the strategy was to constrain the SDE forms themselves. This canon REPLACES that framing: we
  constrain the document's architecture and the present/absent decision, not the space of SDEs.
---

# The Document-Architecture Constraint

**Liz's governing principle for SDE extraction. This is the canon every schema, prompt, and
validator in this project must serve.**

## The thesis (one sentence)

> We are not constraining the SDEs — we are constraining the **document**: we map the architecture of
> the actual paper as it moves through its transformations, and at every node we force the agent to
> answer only one thing — **is this present or not present?** — so that when something is absent it
> returns an absolute "absent" value instead of hallucinating one.

## What we are NOT doing

- **Not** writing constraints for the SDEs themselves. The space of stochastic formulations is
  open-ended; trying to enumerate "what a valid diffusion term looks like" is exactly where an agent
  invents plausible-but-wrong structure. We abandon that approach.
- **Not** asking the agent to *understand* the model well enough to judge correctness. That is the
  human reviewer's job (the HITL queue). The agent's job is narrower and more reliable.

## What we ARE doing

1. **Map the architecture of the actual document.** The paper has a structure: it presents a
   deterministic model, then performs a sequence of **transformations** toward a stochastic one. We
   build a fixed map of the slots that structure implies — variables, parameters, initial conditions,
   each drift term, each diffusion/noise term, each transformation step — mirroring how the document
   itself is laid out.

2. **Constrain the agent to a binary epistemic act at every slot:** *Is this value/term/relationship
   stated in the document, or not?* Two answers only:
   - **Present** → record the stated value, with its location (page/equation).
   - **Absent** → record an **absolute "absent" value** (an explicit sentinel — e.g. `not_stated`),
     not a number, not an inference, not a guess.

3. **The map has absolute values that FORCE one of those two answers.** Every slot must resolve to
   *stated* or *explicitly absent*. There is no slot, and no schema affordance, for a fabricated
   gap-filler. If the answer does not exist in the document, the "absent" value is supplied **by the
   map**, so the agent never needs to search for, derive, or invent one to fill the hole.

## The load-bearing rule — the document presses; absence holds

This is the heart of the contribution, stated explicitly because it is the failure mode everything
else exists to prevent:

> **The document itself will press for transformations.** The prose drives forward — "and thus we
> obtain", "substituting gives", "this yields" — pushing toward a result as if a value *must* exist
> because the argument needs one. **When the document presses for a value but that value is not
> actually stated, the answer remains: not present.** The document's rhetorical or mathematical demand
> for a value does **not** create the value. Absence is preserved straight through every
> transformation the paper performs.

A correct extraction therefore returns **zero / absent** for a pushed-for-but-unstated quantity —
deliberately, as the right answer — rather than manufacturing a value to satisfy the document's
momentum. **Returning "absent" is success, not failure.** (This is the same discipline the prior
manual system enforced by hand: AT3_review's rule "no guessing or approximating — documented absence
is a valid outcome; invented values are not." Liz's contribution generalizes that rule into the
*architecture of the constraint itself*: the map makes absence the structurally-forced default
whenever the document does not supply a value.)

## Why this works (the mechanism)

- Hallucination happens when an agent is asked an open question ("what is the diffusion term?") with
  an implicit expectation that an answer exists. The document's forward pressure amplifies this.
- By converting every node into a **closed present/absent decision against a fixed map**, we remove the
  open question. The agent is never rewarded for producing a value; it is only ever asked to *locate*
  one or declare it absent.
- The "absent" value is **pre-supplied by the map**, so the path of least resistance for the agent is
  to mark absence — not to fill a gap. We engineer the constraint so the truthful answer is also the
  easy answer.

## Where this lives in the project

- This is the **ontology / canon layer** for `research/` — the principle that governs the Pydantic
  schema design, the extraction prompts, and the validators.
- It reframes the schema work: fields are **slots in a document-architecture map**, each typed as
  `present(value, location)` or `absent`. The `Optional[...]`-with-explicit-`not_stated` pattern from
  the earlier schema sketch is the right primitive — but its *purpose* is now defined by this canon:
  the nullable field is the present/absent fork, and "absent" is a first-class, forced outcome.
- It tells us what the agent does vs. what the human does: **agent = present/absent mapping; human =
  correctness judgment** in the HITL queue.

## Open questions for the build (flagged, not yet decided)

1. What is the exact representation of the "absent" absolute value — a single sentinel, or typed
   absences (not-stated vs. stated-but-unreadable vs. defined-elsewhere)?
2. How do we encode a *transformation step* as a node in the map, so the present/absent decision can
   be made at each step (not just on the final model)?
3. How granular is the map — per equation? per term? — and is that granularity fixed across papers or
   discovered per document?
