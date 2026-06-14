---
title: Targeting modes
description: The four ways a user tells the engine what to extract from a paper.
---

When a paper is added, the user chooses how the engine should target what to extract. The
choice rides on the job as a `target` JSONB field and shapes the instruction given to the
model (`services/extraction/processor.py`).

| Mode | The user… | The job carries |
|---|---|---|
| `auto` | lets the engine detect the model and verifies it | `{ "mode": "auto" }` |
| `figure` | names the figure to target | `{ "mode": "figure", "figure_ref": "Figure 2" }` |
| `model` | describes the model to find | `{ "mode": "model", "model_desc": "..." }` |
| `whole` | extracts every model the engine finds | `{ "mode": "whole" }` |

The mode changes only the *instruction* to the model — never the schema or the canon. A
present/absent result is returned regardless of mode.

## The anchor is one sub-figure

When the user names a figure, the anchor must be **one graphic** — a single sub-figure (e.g.
"Figure 2 (bottom-left)"), never a whole multi-panel page. A page of diagrams is many models;
extracting against it produces blurred, partial results. The picker resolves a chosen figure
plus a sub-figure letter into a single anchor (`figure_ref = "Figure 2 (c)"`), and that one
graphic's **panels become the variable checklist** the extractor must complete.

## Commands, not values

The `target` carries a **command**, not a finished value. `{ "mode": "auto" }` says *"detect
the figure"* — the stored result then records the *real* figure the engine found, never the
literal string `auto`. The job also carries the [`lane`](/reference/database/) (`walkthrough`
or `bulk`) so the result reaches the right audience.

*Source: `services/extraction/processor.py`, `apps/dashboard/src/figures.ts`,
`supabase/migrations/0002_job_target.sql`, `0004_extraction_lane.sql`.*
