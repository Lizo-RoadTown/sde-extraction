-- Faceted tag system persistence (ADR 0008; mirrors services/extraction/facets.py).
-- Two tables: the FACET registry (the dimensions) and ENTITY_TAG (one tag = a value within a facet
-- on one piece of data, with its proof). Additive, schema-ahead (no producer wired yet).
--
-- Controlled VOCABULARIES are NOT duplicated here: content facets draw their concepts from the
-- per-facet registry tables (formulation_families / variable_roles / parameter_roles, migrations
-- 0006-0008) and the bounded axes (noise-source, calculus, verification-status, confidence-tier)
-- live in code. entity_tag.value is validated in-app (facets.validate_tag). The knowledge graph is
-- a later read-projection of entity_tag (typed nodes = pieces, typed edges = shared facets).

create table if not exists facet (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,           -- e.g. 'model-family', 'author', 'attached-to'
  label       text not null,
  kind        text not null,                  -- content | bibliographic | structural | proof
  controlled  boolean not null default true,  -- has a fixed vocabulary vs a free/derived value
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists entity_tag (
  id            uuid primary key default gen_random_uuid(),
  entity_kind   text not null,            -- 'paper' | 'figure' | 'model' | 'variable' | 'parameter' | 'term'
  entity_id     text not null,            -- ref/field_path of the piece (e.g. 'parameters[5]')
  facet_key     text not null references facet(key),
  value         text not null,            -- concept name (controlled) or literal (free)
  value_is_new  boolean not null default false,  -- proposed concept awaiting the candidate HITL track
  -- provenance (the nanopublication model as columns): why this tag is real
  quote         text not null default '',
  page          integer,
  source_sha256 text not null default '',  -- the source PDF fingerprint
  span_sha256   text not null default '',  -- SHA-256 of the quote
  confidence    double precision,
  created_at    timestamptz not null default now()
);
create index if not exists entity_tag_entity_idx on entity_tag(entity_kind, entity_id);
create index if not exists entity_tag_facet_idx  on entity_tag(facet_key);
create index if not exists entity_tag_value_idx  on entity_tag(facet_key, value);

alter table facet enable row level security;
create policy "authed full access" on facet for all to authenticated using (true) with check (true);
alter table entity_tag enable row level security;
create policy "authed full access" on entity_tag for all to authenticated using (true) with check (true);

-- Seed the facet registry from facets.py FACETS (18 dimensions).
insert into facet (key, label, kind, controlled, description) values
  ('model-family', 'Stochastic-model family', 'content', true, 'how noise enters the model'),
  ('transformation', 'Transformation', 'content', true, 'an operation between the stated model and the figure'),
  ('variable-role', 'Variable role', 'content', true, 'what a state variable represents'),
  ('parameter-role', 'Parameter role', 'content', true, 'what a constant represents'),
  ('noise-source', 'Noise source', 'content', true, 'demographic | environmental | either'),
  ('calculus-convention', 'Calculus convention', 'content', true, 'ito | stratonovich | unspecified'),
  ('author', 'Author', 'bibliographic', false, 'an author of the paper (ORCID where available)'),
  ('affiliation', 'Affiliation', 'bibliographic', false, 'an author institution (ROR where available)'),
  ('journal', 'Journal / source', 'bibliographic', false, 'the venue the paper was published in'),
  ('year', 'Year', 'bibliographic', false, 'publication year'),
  ('doi', 'DOI', 'bibliographic', false, 'the work identifier'),
  ('domain', 'Domain', 'bibliographic', false, 'subject domain (MeSH-derived once loaded)'),
  ('field', 'Field', 'bibliographic', false, 'field of science (OECD once loaded)'),
  ('pathogen', 'Pathogen', 'bibliographic', false, 'the disease / pathogen modelled'),
  ('attached-to', 'Attached to', 'structural', false, 'the variable/term/model this piece belongs to'),
  ('order', 'Order', 'structural', false, 'position within its group'),
  ('verification-status', 'Verification status', 'proof', true, 'unverified|located|machine_verified|figure_reproduced|human_verified'),
  ('confidence-tier', 'Confidence tier', 'proof', true, 'exact|normalized|ambiguous|not_found')
on conflict (key) do nothing;
