-- sde-extraction MVP schema (single team).
-- Mirrors the engine's model: one (paper, figure) extraction, every fact present/absent,
-- the structured archive stored as JSONB + indexed facets for the Library.

-- papers: one per ingested PDF (the provenance root)
create table if not exists papers (
  id              uuid primary key default gen_random_uuid(),
  file_sha256     text not null unique,        -- fingerprint of the exact PDF
  doc_root_sha256 text,                         -- hash of the canonical text layer
  parser_id       text,                         -- determinism guarantee
  page_count      int,
  title           text,
  pathogen        text,
  doi             text,
  filename        text,
  storage_path    text,                         -- path in the 'papers' storage bucket
  status          text not null default 'uploaded',
  uploaded_at     timestamptz not null default now()
);

-- extraction_jobs: one per (paper, figure) run through the pipeline (drives the Process surface)
create table if not exists extraction_jobs (
  id          uuid primary key default gen_random_uuid(),
  paper_id    uuid references papers(id) on delete cascade,
  figure_label text not null,
  stage       text not null default 'queued',  -- ingest|pdf_to_math|extract|machine_verify|human_verify|stored|failed
  progress    real not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- extractions: the structured archive — one (paper, figure) model
create table if not exists extractions (
  id                uuid primary key default gen_random_uuid(),
  paper_id          uuid references papers(id) on delete cascade,
  figure_label      text not null,
  status            text not null default 'needs_human', -- queued|extracting|machine_verify|needs_human|verified|failed
  model             jsonb not null default '{}'::jsonb,  -- the present/absent ExtractedModel + span proofs
  figure_reproduced boolean,                              -- the oracle
  -- indexed facets for the Library (locked: pathogen, formulation family, journal/year, model features)
  pathogen          text,
  doi               text,
  file_sha256       text,
  formulation_family text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists extractions_pathogen_idx on extractions(pathogen);
create index if not exists extractions_status_idx   on extractions(status);
create index if not exists extractions_doi_idx      on extractions(doi);

-- review trail: the human verifier's decisions + per-slot edits (audit, not just outcome)
create table if not exists review_decisions (
  id           uuid primary key default gen_random_uuid(),
  extraction_id uuid references extractions(id) on delete cascade,
  reviewer     text not null,
  decision     text not null,        -- approve | send_back
  reason       text,
  created_at   timestamptz not null default now()
);

create table if not exists review_edits (
  id           uuid primary key default gen_random_uuid(),
  extraction_id uuid references extractions(id) on delete cascade,
  reviewer     text not null,
  field_path   text not null,        -- e.g. "parameters[5].value"
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

-- Single-team RLS: any authenticated user has full access (no org federation).
alter table papers            enable row level security;
alter table extraction_jobs   enable row level security;
alter table extractions       enable row level security;
alter table review_decisions  enable row level security;
alter table review_edits      enable row level security;

create policy "authed full access" on papers           for all to authenticated using (true) with check (true);
create policy "authed full access" on extraction_jobs  for all to authenticated using (true) with check (true);
create policy "authed full access" on extractions      for all to authenticated using (true) with check (true);
create policy "authed full access" on review_decisions for all to authenticated using (true) with check (true);
create policy "authed full access" on review_edits     for all to authenticated using (true) with check (true);
