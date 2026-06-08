---
title: "Schema ↔ Canon alignment — gap note + revision status"
status: MIXED — see status table below. One piece is LIZ-APPROVED; everything else is UNDER REVIEW.
type: gap note / revision record
date: 2026-06-08
authored_by: dev agent (Claude Code), recording Liz's approval decision
human_input: >
  Liz directed this revision on 2026-06-08: bring schema.py into line with the document-architecture
  canon, mark the revised pieces as her approved revision, and mark all other classifications as still
  under review. She also stated the current testing status (see below).
validated_by: partial — see status table
---

# Schema ↔ Canon alignment

## Why this note exists

Three artifacts describe the extraction schema, and until now they disagreed:

| Artifact | Shape | Canon-aligned? |
|---|---|---|
| `2026-06-05-document-architecture-canon.md` | The governing principle (constrain the document; force present/absent; absence holds under transformation pressure) | — (it *is* the canon) |
| `services/extraction/extract_sample.py` | **present/absent** discriminated `Slot = Union[Present, Absent]`, two-reason `AbsenceReason`, document-pressure rule in the prompt | **Yes** |
| `services/extraction/schema.py` | bare-null v1 — every field `X \| None`; absence = Python default, indistinguishable from "model didn't answer" | **No (pre-canon)** |

`schema.py` itself flagged that it would be superseded "once Liz validates the canon." This note records
that validation decision and the resulting revision.

## What was wrong with the bare-null v1 (schema.py)

Measured against the canon, the v1 schema had three gaps:

1. **Absence was not first-class.** `value: float | None = None` cannot distinguish *"the paper states
   this is absent"* from *"the extractor skipped it."* The canon requires a **forced** present/absent
   decision, with absence supplied by the map.
2. **No representation of document pressure.** The load-bearing rule — *the document presses for values
   ("thus we obtain…"); absence holds anyway* — had no slot. A nullable float does not resist that pull.
3. **No reason for absence.** The canon (as Liz refined it) distinguishes *why* something is absent.

`extract_sample.py` already fixed all three; `schema.py` had not. The 2026-06-08 revision brings
`schema.py` to the canon shape so there is **one source of truth**, and `extract_sample.py` can import
from it rather than inlining a duplicate.

## Status of each piece (per Liz, 2026-06-08)

| Piece | Status |
|---|---|
| The document-architecture canon (constrain the document; forced present/absent; absence holds under pressure) | **LIZ-APPROVED REVISION (2026-06-05)** |
| Present / Absent as a **forced** discriminated slot (every slot resolves to one or the other) | **LIZ-APPROVED REVISION** |
| Two-reason absence taxonomy: `not_stated` + `requires_inference` (**collapsed from four** by Liz, 2026-06-05) | **LIZ-APPROVED REVISION** |
| "Transcribe verbatim, never evaluate" rule for present values | **LIZ-APPROVED REVISION** |
| Everything else — the specific slots that exist (which fields are mapped), the Layer-2 lineage/SHA-256 design, `figure_binding`, metadata fields, the transformation-step node shape, granularity of the map | **UNDER REVIEW** (drafted, not yet validated) |

## Testing status (per Liz, 2026-06-08)

**No testing has been done.** The work to date is **manual review of papers to identify the agent-harness
constraints** — i.e., the present/absent design and the two-reason absence taxonomy come from Liz reading
real papers to see what the agent must be constrained to do, not from running the extractor. The
constraint design is grounded in document review, not in extraction test runs. Extraction testing (against
the AT3_review completed-corpus as a gold set) remains to be done.

## Resulting change

`schema.py` revised on 2026-06-08 to the canon-aligned present/absent shape. The Liz-approved pieces are
marked inline in that file; all other classifications carry an `UNDER REVIEW` marker.
