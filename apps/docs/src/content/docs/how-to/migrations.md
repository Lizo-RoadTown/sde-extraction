---
title: Apply database migrations
description: Apply the SQL migrations that define the database schema.
---

The schema is defined by ordered SQL files in `supabase/migrations/`. Apply them in order to
a Supabase Postgres project.

| Migration | Creates |
|---|---|
| `0001_init.sql` | papers, extraction_jobs, extractions, review tables + RLS |
| `0002_job_target.sql` | the `target` JSONB column on extraction_jobs |
| `0003_papers_storage_policies.sql` | storage policies for the `papers` bucket |

Apply each via the Supabase SQL editor, the Supabase MCP `apply_migration` tool, or the
Supabase CLI (`supabase db push`). After applying, confirm the five tables exist and that
the `papers` storage bucket is present.

*Source: `supabase/migrations/`.*
