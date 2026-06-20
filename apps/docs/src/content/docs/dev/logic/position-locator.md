---
title: The position locator (the magnifying glass)
description: How the system recovers the on-page position of each extracted value, and how the magnifying-glass searchlight renders it. Deterministic, no LLM.
status: draft
---

:::caution[In development]
The text-layer locator and the searchlight visualization are live. The OCR fallback for scanned /
raster pages is **planned, not built** — marked below. This is a skeleton; sections marked _(expand)_
are still being written.
:::

The "magnifying glass" is two parts: a deterministic **locator** (backend) that finds each value's
box on the page, and the **searchlight** (frontend) that animates a lens to it. Neither uses an LLM.

## The locator — recover position from the same text the value came from

The extractor returns each value as a verbatim **quote + page**. The locator finds that quote's box
in the PDF's **own vector text layer** — the same text the value was lifted from. Recovering the box
from the source text (not a separate model) is the right architecture and the current consensus; it
also doubles as verbatim verification (the quote provably appears where claimed).

- **File:** `services/extraction/locator.py` → `annotate_locations()`
- **Matcher:** PyMuPDF `page.search_for` on the whole quote, then shrinking word-prefixes (handles
  line breaks / over-long quotes).
- **Numeric-anchor fallback:** Greek + subscript glyphs (`λ_h`) often don't survive the text layer
  (missing `/ToUnicode`), but the numeric tail (`0.000039`) does — match that to recover the box.
- **Page handling:** search the stated page first, then **all pages** — the LLM's page number is the
  *printed* label, not the physical PDF index (off-by-one is normal).
- **Honest outcomes:** `located` (with the page it was actually found on + the match method), or
  `located:false` with a reason — `no_text_layer` (scanned/raster) vs `not_found`.

_(expand: the normalized-rect math; why first-occurrence is acceptable; the per-page text probe.)_

## Why this shape

- **Determinism web** — the box is precise, checkable script work; never let the LLM (or the UI) draw
  it. See the wrap-the-fuzzy-LLM-at-every-seam principle.
- A 100% miss is what flagged the old matcher (pdfplumber token-equality fused math tokens and trusted
  the LLM page). Verified fix: 0/5 → 5/5 on the reference malaria paper.

_(expand: the before/after, the adversarial-review findings.)_

## The searchlight (visualization)

- **File:** `apps/dashboard/src/surfaces/SpotlightQuest.tsx`
- The lens lands **only** on a real located rect. If a value isn't located, the spotlight is hidden,
  the caption says "position not found," and the value is marked **“· no position”** in the panel —
  never a faked highlight. (This honesty is the whole point; the earlier `scatter()` to a pseudo-random
  spot was the bug.)

_(expand: the rAF lens glide; located vs unlocated rendering; page flips.)_

## Backfilling existing extractions

The locator runs at extraction time, so older extractions have no positions. Re-locate them
deterministically (no LLM, no re-extraction):

- **File:** `services/extraction/backfill_locations.py`
- Follows `APP_SCHEMA` (so it can run per path). `--dry` to preview, `--limit N` to cap.

_(expand: promote to a how-to page with the exact command + expected output.)_

## Planned — OCR fallback for scanned / raster pages

When there is no text layer (or a value lives in a rasterized table), a string matcher can't recover
the box. The planned fallback rasterizes the page and runs an OCR engine that returns **word boxes**,
then runs the *same* quote→box matcher over the OCR output.

- Candidates: Surya / docTR (open-source word boxes), or NVIDIA NeMo-Retriever NIMs for region + OCR
  line boxes (note: NVIDIA returns region/line boxes, never a scalar value's box — it's an OCR/region
  source, not a replacement for the text-layer locator).
- **Status:** not built. Do not read this section as live.

## Related

- [Where each value comes from](/explanation/provenance/) (the user-facing view)
- [The magnifying glass — seeing where each value is](/explanation/magnifying-glass/) (user-facing)
- [Triaging failures across the boundary](/dev/operations/failure-triage/)
