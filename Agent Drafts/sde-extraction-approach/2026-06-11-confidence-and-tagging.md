---
title: "Confidence levels + model tagging — the trust-calibration layer"
status: AGENT DRAFT — transcribed from Liz's direction, awaiting her validation
type: research canon / system design
authored_by: Liz Osborn (concept + direction)
transcribed_by: dev agent (Claude Code)
date: 2026-06-11
human_input: >
  Liz set this direction on 2026-06-11: humans keep verifying every curated model, but we add
  (1) categorize/tag each model by type, (2) give extraction models confidence levels, (3) human
  verification feedback per model raises or lowers that confidence. She specified granular,
  per-independent-dimension confidence (model type AND figure type, plus other types discovered as
  documents are fed in); confidence drives triage of human effort, routing to a better extractor,
  and queue ordering; tags are engine-proposed, human-confirmed.
validated_by: (pending — Liz)
validation_notes: (none yet)
relates_to: "[[2026-06-05-document-architecture-canon]] (the extraction discipline this calibrates)"
---

# Confidence levels + model tagging

**Liz's direction, 2026-06-11. The third pillar of the system, alongside the document-architecture
canon (how we extract) and the HITL queue (how we verify). This pillar is how we LEARN WHICH
EXTRACTORS TO TRUST, ON WHICH KINDS OF DOCUMENT, FROM THE VERIFICATION WE ALREADY DO.**

## The thesis (one paragraph)

Humans continue to verify every curated model — the HITL queue does not go away. But each
verification is also a **signal**. We tag every (paper, figure) extraction along independent
dimensions (model type, figure type, and more as they emerge). We give each **extraction model a
confidence level per dimension-value**. When an extractor's output survives human verification for a
given tag, its confidence on that tag **rises**; when the human rejects/corrects it, confidence
**falls**. Confidence is therefore **earned from outcomes**, never assigned — and it is **granular**:
an extractor can be trusted on one model-type and distrusted on another.

## Three moving parts

### 1. Tagging — categorize each extraction along INDEPENDENT dimensions

Not one "type" field. A set of dimensions that vary independently, so confidence can be tracked
separately on each (Liz: "anything that could be independent of the others"):

- **model type** — the formulation family (OU-process, environmental/parametric noise, demographic /
  chemical-Langevin, …). Already a field: `extractions.formulation_family` in the schema.
- **figure type** — the kind of figure being reproduced (trajectory/realizations, sensitivity sweep,
  phase plot, …).
- **emergent dimensions** — OTHER independent axes discovered as documents are fed in (e.g. compartment
  count, noise placement, journal/era conventions). The design must let new dimensions be ADDED without
  reworking the confidence model — each is just another independent key.

**Tag source:** engine proposes, human confirms (mirrors Intake's "engine enumerates, user confirms").
The extractor suggests each tag; the verifier confirms or corrects it during review. The confirmed tag
is the one confidence is keyed on.

### 2. Confidence — per extractor × per dimension-value, independent

A confidence score lives at the intersection of **(extractor, dimension, value)** — e.g.
`(extractor-v2, model_type, ornstein_uhlenbeck) = 0.86`. Independent axes mean an extractor has a
VECTOR of confidences, not one number. Keep them separate; do not blend into a single score (a blend
hides WHERE an extractor is weak, which is the whole point).

Open (for Liz / later): the exact update rule. A sensible default is a running success rate with
recency weighting (recent verifications matter more) and a volume guard (low-sample tags are "unproven",
not "confident"). To be decided before implementation — flag as UNDER REVIEW.

### 3. Feedback loop — the human verdict is the training signal

The HITL queue already records the human verdict (`review_decisions`) and per-slot corrections
(`review_edits`). Each verification, tagged by dimension, updates the relevant confidence scores:

```
extract -> tag (engine proposes) -> human verifies + confirms tags
        -> outcome (approve / send-back / per-slot edits)
        -> update confidence[(extractor, dimension, value)] for each confirmed tag
```

No new human work is invented — the verification Liz already does becomes the calibration signal.

## What confidence DRIVES (Liz selected all three)

1. **Triage human effort.** High confidence on a tag → lighter human pass / sampling; low confidence →
   full per-slot scrutiny. Humans still see everything that needs eyes, but effort is proportional to
   risk. (Note: never silently auto-approve — confidence changes *how much* review, within the canon's
   "every slot judged" rule, not *whether* a human is in the loop. Confirm this boundary with Liz.)
2. **Route to a better extractor.** Low confidence for extractor A on a tag → send that (paper, figure)
   to extractor B which scores higher on it. Confidence becomes a routing table: best extractor per
   document profile.
3. **Order the queue.** Sort the verify queue by confidence (lowest-first) so humans hit the riskiest
   extractions first — the most valuable verifications happen earliest.

## How this fits what already exists (PROBE)

- `extractions.formulation_family` + the Library's facet filters — the model-type axis is already
  designed; this generalizes it to multiple independent dimensions.
- `review_decisions` + `review_edits` — the feedback signal is already captured per extraction.
- The Process surface's "Agent self-update" card ("trust 0.81 · agents propose, a human approves,
  trust accrues") already gestures at this; this draft makes it the real mechanism.
- The prior-art finding stands: DARPA ASKEM did deterministic extraction but NOT this earned-confidence,
  per-type trust-calibration loop — so this is genuinely additive, not reinventing.

## Open questions (UNDER REVIEW — for Liz / later)

1. The confidence update rule (success-rate? recency-weighted? Bayesian? volume guard for low samples?).
2. The triage boundary: how light can a "high-confidence" human pass get without violating the canon's
   "every slot judged before store"? (Default assumption: never fully skip a human; confirm.)
3. The starting set of independent dimensions, and the mechanism for ADDING a newly-discovered
   dimension without reworking the model.
4. Schema: where confidence lives (a new table keyed on extractor + dimension + value), and where tags
   live (per-extraction, multi-dimension).
5. What "extractor" identity is (model version? prompt version? both?) — confidence must be keyed to a
   stable extractor identity so a prompt change can reset/branch its earned trust.

## Status

Concept + direction are LIZ'S. This is the agent's transcription for her to validate and promote to
`Human validated/`. Nothing here is implemented; it is the design to build toward once validated.
