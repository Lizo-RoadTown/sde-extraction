---
title: Database schema
description: The Postgres tables that hold papers, jobs, extractions, and the human review trail.
---

The system stores its state in Postgres (Supabase). The schema is defined by migrations in
`supabase/migrations/`. It is a single-team model: any authenticated user has full access;
there is no multi-organization federation.

## Tables

| Table | Holds | Key columns |
|---|---|---|
| `papers` | one row per ingested PDF (the provenance root) | `file_sha256` (unique), `storage_path`, `pathogen`, `doi` |
| `extraction_jobs` | one row per `(paper, figure)` run through the pipeline | `stage`, `progress`, `target` (JSONB) |
| `extractions` | the structured archive — one present/absent model | `status`, `model` (JSONB), `figure_reproduced`, `lane`, indexed facets |
| `review_decisions` | the human verifier's verdict per extraction | `decision` (approve / send_back), `reviewer` |
| `review_edits` | per-slot corrections a reviewer made | `field_path`, `before`, `after` |
| `validation_events` | the seam telemetry — one row per data-transfer point crossed | `point`, `subject_kind`, `outcome`, `latency_ms`, `lineage_ref`, `tags` (JSONB) |

The `extractions.model` column holds the full present/absent `VerifiedExtraction` as JSONB,
with indexed facet columns (`pathogen`, `doi`, `formulation_family`, `file_sha256`) for the
Library. `extractions.lane` (`walkthrough` / `bulk`, migration `0004`) routes a result to the
right audience — the guided Walkthrough or the fast Bulk queue.

## Seam telemetry — `validation_events`

`validation_events` (migration `0005`) is the observability spine: each time data crosses a
**seam** (a data-transfer point — see [Observability → the seam map](/explanation/observability/)),
a row is written. `point` names the seam (`extract`, `locate`, `store`, …), `subject_kind` is
who acted (`script` / `agent` / `human`), `outcome` is `pass` / `flag` / `fail`, and `tags`
carries the aggregate detail (type · count · tier). The worker emits these at `extract`,
`locate`, and `store` today; the Extraction Health tab reads them with `loadSeamTelemetry()`.

## Provenance & review tables

`papers.file_sha256` is the document fingerprint, computed at upload. `review_decisions` and
`review_edits` are the audit trail of human verification — not just the outcome, but each
correction, which is the feedback signal the [confidence layer](/reference/confidence/) will
consume.

## Access control

Every table has row-level security enabled with a single policy: authenticated users have
full access. The `papers` storage bucket is **public** by design — a deliberate choice for
reproducibility (anyone can trace an extracted model to its source paper).

*Source: `supabase/migrations/0001_init.sql`, `0002_job_target.sql`,
`0003_papers_storage_policies.sql`, `0004_extraction_lane.sql`, `0005_validation_events.sql`.*
