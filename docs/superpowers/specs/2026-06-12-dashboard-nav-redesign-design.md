# Dashboard navigation redesign — design

*Approved by Liz 2026-06-12. Runtime work (`apps/dashboard/`). Iterated live on `main`
(Render auto-deploys); the prior dashboard is preserved on branch `dashboard-stable`.*

## Problem

The dashboard's four tabs (Intake · Process · Verify · Library) are four flat, equal
sidebar items organized by pipeline stage. Two issues:

1. **Process is redundant.** Its three parts already live elsewhere — ingestion/processing
   status belongs in Intake, the human-verify part in Verify, the stored part in Library.
   Nothing unique sits there.
2. **The new confidence/tagging layer** (the [third pillar](../../../Agent%20Drafts/sde-extraction-approach/2026-06-11-confidence-and-tagging.md))
   is cross-cutting and has no home.

## Decision: organize by the work, not the pipeline

Four tabs, each a thing a human *does*:

| Tab | Purpose | Absorbs |
|---|---|---|
| **Intake** | Add papers (one or batch) **and watch them process here** | old Intake + the engine-watching half of Process |
| **Verify** | Escalation inbox — present/absent + figure-match | Verify + Process's human-verify stage |
| **Library** | Browse verified `(paper, figure)` models | Library + Process's stored stage |
| **Extraction Health** | Confidence/tagging scores **+ the agent self-update loop** | confidence pillar + Process's self-update card |

**Process is removed as a tab.** Its pieces fold into the other three; the self-update loop
moves to Extraction Health (both are "the engine getting better").

## Intake — add + watch (scales to both volumes)

Usage is **both** trickle (one at a time, interactive) and batch (dump 10s–1000s, verify
later), and people **watch it work**. So Intake's processing view is one component that
adapts:

- **Add zone** — drop one or many PDFs; fingerprint on arrival (already built, `data.ts`).
- **Live processing view** — the pipeline stages (`Ingest → PDF→math → Extract →
  Machine-verify`) shown per in-flight paper, updating live. Relocated from Process's
  `PipelineFlow`.
  - *Small:* a few rows you watch tick through.
  - *Batch:* the same view becomes batch progress — "N of M done · K failed," failures
    surfaced for retry.
- Same component, invisible-when-small → batch-dashboard-when-large.

## Extraction Health — confidence + self-update

One surface for "how well is the engine doing, and is it improving":

- **Confidence** — per-`(extractor × dimension-value)` scores (model type, figure type,
  emergent dims), earned from verification outcomes; a vector, not a blended number.
- **Self-update loop** — agents propose improvements; human approves/rejects; trust accrues.
  (Real machinery, moved from Process.)
- **Embedded signals elsewhere** — a confidence chip on Verify items + queue sort; a
  confidence/tag column in Library. Health is the home; the signal travels.

## Honest seams (start as structure, populate later)

- **Confidence scores + tags don't exist in the data yet.** Extraction Health ships as the
  *structure* — the self-update loop (which is real) + confidence as a designed-but-unpopulated
  view — until the engine + schema produce real scores. Same seam as the PDF/figure panes.
- The live processing view's per-paper stage data is mock until the engine emits real job
  rows (Supabase `extraction_jobs` already designed for it).

## Build order

1. Nav restructure in `App.tsx` — 4 tabs, remove Process; add Extraction Health.
2. New `ExtractionHealth` surface — move the self-update card from `Process.tsx`; add the
   confidence view (structure).
3. Fold Process's `PipelineFlow` + gauges into `Intake.tsx` as the live processing view;
   make it scale (small vs batch).
4. Delete `Process.tsx` once its parts are relocated.
5. Embedded confidence signals in Verify + Library (lightweight, structure-level).

Each step builds + verifies + pushes (live on Render) before the next.

## Out of scope (now)

- The confidence *compute* (update rule, schema tables) — that's the confidence pillar's own
  build, still UNDER REVIEW. This redesign builds the *surface*, not the math.
- Real batch ingestion backend.
