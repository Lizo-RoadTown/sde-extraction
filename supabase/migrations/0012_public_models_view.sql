-- Read-only PUBLIC API surface.
-- The base tables stay RLS-locked (the anon role cannot read them directly). This curated view is the
-- ONLY thing the public can read: a plain view runs with its owner's privileges (security_invoker = off,
-- the PG15+ default), so granting SELECT on just the view exposes exactly these columns and nothing
-- else. Internal fields (storage_path, lane, file hashes) and internal tables (review_decisions,
-- review_edits, validation_events, extraction_jobs) are deliberately omitted. Read-only: only SELECT is
-- granted, and the join makes the view non-writable anyway.
-- Served by PostgREST at /rest/v1/public_models with the project's public (anon) key.
create or replace view public.public_models as
select
  e.id,
  e.paper_id,
  p.title,
  e.figure_label,
  e.pathogen,
  e.doi,
  e.formulation_family,
  e.status,
  e.figure_reproduced,
  e.model,
  e.created_at,
  e.updated_at
from public.extractions e
left join public.papers p on p.id = e.paper_id;

comment on view public.public_models is
  'Public read-only API: all extracted SDE models + paper bibliography. Exposed to the anon role via PostgREST. No internal review/telemetry/storage fields.';

grant select on public.public_models to anon, authenticated;
