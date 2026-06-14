-- Step 1 classification persistence (docs/proposals/2026-06-13-classification-taxonomy-foundation.md).
-- Two tables: the SELF-GROWING family registry (the runtime source of truth, seeded from
-- services/extraction/classification.py) and the classification-candidate HITL queue (the
-- governed "add" — new families enter the registry ONLY after a human verifies a candidate).
-- Additive; no producer/consumer is wired yet, so this is schema-ahead (apply when wiring lands).

-- The registry. Mirrors classification.py FormulationFamily; grows via approved candidates.
create table if not exists formulation_families (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,   -- match key, e.g. 'ornstein-uhlenbeck-parameter'
  label              text not null,
  how_noise_enters   text not null default '',
  noise_source       text not null default 'either',  -- demographic|environmental|either (Allen's axis)
  recognized_by      text not null default '',
  provenance         text not null,          -- corpus-confirmed | prior-art-candidate
  literature_verified boolean not null default false,
  citation           text not null default '',
  seen_in            jsonb not null default '[]'::jsonb,  -- ground-truth paper refs
  status             text not null default 'active',      -- active | merged | deprecated
  created_at         timestamptz not null default now()
);
create index if not exists formulation_families_name_idx on formulation_families(name);

-- The candidate queue (Track B). A model-match proposing a NEW/unclassified family raises one;
-- it parks the extraction at status='needs_classification' until a human resolves it here.
create table if not exists classification_candidates (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null default 'formulation_family',  -- formulation_family | transformation
  proposed_name    text not null default '',
  proposed_label   text not null default '',
  how_noise_enters text not null default '',
  recognized_by    text not null default '',
  evidence_quote   text not null default '',     -- verbatim, verifiable against the paper
  evidence_page    integer,
  source_paper_id  uuid references papers(id) on delete set null,
  source_job_id    uuid references extraction_jobs(id) on delete set null,
  rationale        text not null default '',
  status           text not null default 'pending',  -- pending | approved | rejected | merged
  merged_into      text,                              -- existing family name when status='merged'
  reviewer         text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create index if not exists classification_candidates_status_idx on classification_candidates(status);

-- extractions.status gains a new value 'needs_classification' (Track B gate, BEFORE 'needs_human').
-- status is free text (no CHECK/enum), so no column change is needed — documented here for the record.

alter table formulation_families enable row level security;
create policy "authed full access" on formulation_families for all to authenticated using (true) with check (true);
alter table classification_candidates enable row level security;
create policy "authed full access" on classification_candidates for all to authenticated using (true) with check (true);

-- Seed the registry from the current Python source of truth (literature-verified families;
-- research/findings/2026-06-14-formulation-family-verification.md). on conflict: keep DB if it
-- already grew. The Python seed remains the bootstrap; the DB becomes runtime truth.
insert into formulation_families (name, label, how_noise_enters, noise_source, recognized_by, provenance, literature_verified, citation, seen_in) values
  ('white-noise-brownian', 'White-noise / Brownian (Wiener) perturbation',
   'a Wiener increment dB(t) added to rate(s): dX = drift dt + diffusion dB', 'either',
   'dB(t)/dW(t) terms, standard Brownian motion, white noise', 'corpus-confirmed', true,
   'Allen 2017, Infect. Dis. Model. 2(2):128-142, sec.4', '["Witbooi_Malaria"]'::jsonb),
  ('environmental-parametric-noise', 'Environmental / parametric (multiplicative) noise',
   'a rate fluctuates: a parameter (often beta) carries multiplicative noise', 'environmental',
   'noise on a transmission/contact rate; environmental variability; multiplicative sigma*X*dB',
   'prior-art-candidate', true, 'Allen 2017, sec.1 + final (environmental variability)', '[]'::jsonb),
  ('demographic-noise-cle', 'Demographic noise / Chemical Langevin (diffusion approximation)',
   'drift = the ODE; diffusion from event-rate covariance (CTMC -> SDE limit); ~1/sqrt(N)', 'demographic',
   'per-event sqrt(rate) diffusion; diffusion approximation; chemical Langevin', 'prior-art-candidate', true,
   'Allen 2017 sec.4; Gillespie 2000, J. Chem. Phys. 113:297', '[]'::jsonb),
  ('ornstein-uhlenbeck-parameter', 'Ornstein-Uhlenbeck parameter process',
   'a parameter mean-reverts: dx = theta(xbar - x)dt + sigma dB, then feeds a rate', 'environmental',
   'mean-reversion theta(xbar-x); auxiliary log-process; Ornstein-Uhlenbeck', 'corpus-confirmed', true,
   'Allen 2017 (mean-reverting env.); Wang et al. 2024, Sci. Rep. 14, s41598-024-52335-6',
   '["Dengue Infection OrnsteinUhlenbeck", "10_1007s00332.023_copy"]'::jsonb),
  ('levy-jump', 'Levy / jump noise',
   'discontinuous jumps via a Levy/Poisson term alongside or instead of Brownian diffusion', 'environmental',
   'jump/Poisson integral terms; Levy; compensated jumps; jump-diffusion', 'corpus-confirmed', true,
   'Zhou et al. 2020, Adv. Differ. Equ. 2020:170, s13662-020-2521-6 (not in Allen)',
   '["Cholera", "Viral Infection", "Dengue Infection OrnsteinUhlenbeck"]'::jsonb)
on conflict (name) do nothing;
