-- The hook sink: every pipeline stage emits a validation_event (the telemetry spine,
-- docs/superpowers/specs/2026-06-12-validation-points-map.md). Written by the worker
-- (service role); read by the dashboard (authed). One record serves both provenance
-- (audit trail of every check the data passed) and health (point/agent telemetry).
create table if not exists validation_events (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references extraction_jobs(id) on delete cascade,
  paper_id     uuid references papers(id) on delete set null,
  thread_id    text,                 -- LangGraph checkpoint thread (= job id), for replay
  point        text not null,        -- figure_detect|figure_read|variable_extract|reconcile|crosscheck|locate|verify|store|V8
  subject_kind text not null,        -- 'script' | 'agent' | 'human'
  subject_id   text,                 -- agent name+version / script name+version
  outcome      text not null,        -- pass|fail|flag|retry|na
  latency_ms   integer,
  lineage_ref  text,                 -- field_path or checksum ref
  tags         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists validation_events_point_idx   on validation_events(point);
create index if not exists validation_events_job_idx     on validation_events(job_id);
create index if not exists validation_events_created_idx on validation_events(created_at);

alter table validation_events enable row level security;
create policy "authed full access" on validation_events for all to authenticated using (true) with check (true);
