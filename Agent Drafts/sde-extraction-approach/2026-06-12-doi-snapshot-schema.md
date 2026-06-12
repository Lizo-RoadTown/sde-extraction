---
title: "DOI-snapshot intake schema — proposed"
status: AGENT DRAFT — awaiting Liz validation. NOT applied to the database.
type: schema proposal
date: 2026-06-12
authored_by: dev agent (Claude Code), adapting the proves library schema + 2025-26 best-methods research
human_input: >
  Liz decided (2026-06-12): intake is DOI-only, the extractor snapshots the source directly via TDM
  (no PDF uploads), snapshots are retained as provenance, and — critically — we do NOT curate
  licensed/subscription content. Only openly-licensed (open-access) papers enter. She asked for this
  schema drafted from the proves library's proven shape plus current best methods.
validated_by: (pending — Liz)
---

# DOI-snapshot intake schema (proposed)

The intake model is **DOI-only**: a DOI enters a queue; a worker resolves it against Crossref,
gates on **open licence**, fetches the full text via the publisher's TDM endpoint, retains an
**audit-grade snapshot** as the provenance artifact, and extracts present/absent slots whose lineage
points at exact byte ranges in the snapshot.

This adapts the **proves library**'s proven tables (`raw_snapshots`, `urls_to_process`,
`staging_extractions` byte-offset lineage, `validation_decisions`) keyed on DOI, with audit-grade
provenance columns grounded in WARC / W3C PROV / fixity standards.

## The open-licence gate (the decision that simplifies everything)

**We do not curate licensed/subscription content.** Only openly-licensed papers (CC-BY and similar)
are admitted. Consequences:
- No retention conflict: open licences permit retaining full text with attribution. The
  "subscription TDM requires deleting the corpus" problem never arises because we never fetch it.
- The licence check is a **gate, not a policy flag**: at DOI-resolution, Crossref `license[]` is
  inspected — not open → **rejected at the door, never fetched**; open → fetch + snapshot + retain.
- The whole transparency story stays coherent: anyone can verify any extraction against a source they
  can also freely access.

## Three tables

### 1. `doi_queue` — staging of queued DOIs (the identity + state machine)

Adapts proves `urls_to_process`. The Crossref metadata stored here is the **router**: `link[]` picks
the TDM URL + content-type; `license[]` drives the open-licence gate.

```sql
create table doi_queue (
  id              bigserial primary key,
  doi             text not null unique,            -- idempotency: one row per DOI
  status          text not null default 'queued',
    -- queued | resolving | rejected_licence | fetching | snapshotted | extracting | done | failed
  -- Crossref metadata (the router) — fetched free, no auth
  crossref_raw        jsonb,                        -- full works response, verbatim
  license_array       jsonb,                        -- license[] (URL, content-version, start, delay)
  link_array          jsonb,                        -- link[] (URL, content-type, intended-application)
  is_open_licence     boolean,                      -- the gate result
  licence_url         text,                         -- the open licence detected (e.g. CC-BY)
  publisher           text,
  issn                text[],
  title               text,
  authors             jsonb,
  published_date      date,
  crossref_fetched_at timestamptz,
  -- queue/retry (SELECT … FOR UPDATE SKIP LOCKED + exponential backoff)
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_by       text,
  locked_at       timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on doi_queue (status, next_attempt_at) where status in ('queued','failed');
```

### 2. `snapshots` — the retained provenance artifact (audit-grade, two layers)

Adapts proves `raw_snapshots`, hardened with WARC/PROV/fixity columns.

**A snapshot has two layers, captured in order: raw then derived.**

1. **Raw layer** — the *untouched bytes as served* (JATS XML, or a PDF blob — whatever the publisher
   sent), stored and hashed **before anything interprets them**. This is the pristine provenance
   moment: "exactly what the publisher gave us, unaltered, at this time, under this licence." Normalization
   is an interpretation (a PDF text-extractor makes choices, can have bugs), so it must happen *after*
   the snapshot, never before — the snapshot is interpretation-free.
2. **Derived text layer** — the normalized text the extractor reads, produced as an explicit,
   **re-derivable** step from the raw layer. Byte-offset lineage points into *this* text (offsets into
   a PDF blob would be meaningless). If a better extractor comes along, re-derive the text without
   touching the snapshot.

Lifecycle gains a `normalized` step between `snapshotted` (raw stored) and `extracting`.

```sql
create table snapshots (
  id               uuid primary key default gen_random_uuid(),
  doi_queue_id     bigint not null references doi_queue(id),
  doi              text not null,
  -- WHERE + provider
  source_url       text not null,                   -- the TDM link actually fetched
  provider         text not null,                   -- 'plos' | 'pmc' | 'springer-oa' | ...
  -- WHEN (WARC-Date, UTC) — the snapshot moment, before any interpretation
  retrieved_at     timestamptz not null default now(),

  -- RAW LAYER — untouched bytes as served (the pristine provenance record)
  content_raw      bytea,                           -- the served bytes (XML or PDF blob)
  raw_storage_key  text,                            -- if large/binary, bytes live in object storage
  served_format    text not null,                   -- 'jats-xml' | 'xml' | 'pdf' | 'text'
  served_sha256    char(64) not null,               -- fixity digest of the RAW bytes (the snapshot fingerprint)
  content_length   bigint,
  hash_algorithm   text not null default 'sha256',

  -- DERIVED TEXT LAYER — normalized after storage; offsets point here; re-derivable
  content_text     text,                            -- normalized text (null until 'normalized')
  text_sha256      char(64),                        -- hash of content_text
  text_extractor   text,                            -- which normalizer produced it (+ version)
  normalized_at    timestamptz,

  -- HTTP response metadata (audit)
  http_status      int not null,
  http_headers     jsonb,                           -- ETag, Last-Modified, Content-Type…
  -- UNDER WHAT TERMS (open licence, copied as-of-fetch for the record)
  licence_url      text,
  licence_snapshot text,                            -- copy of the licence text at fetch time
  auth_method      text,                            -- 'tdm_api_key' | 'none' (open)
  auth_token_ref   text,                            -- fingerprint/ref, NEVER the raw secret
  -- WHO/WHAT fetched it (W3C PROV agent + activity)
  agent_software   text,
  agent_version    text,                            -- git sha / version
  created_at       timestamptz not null default now()
);

-- re-verify the snapshot hash over time (ISO 16363 / NDSA fixity)
create table fixity_checks (
  id            bigserial primary key,
  snapshot_id   uuid not null references snapshots(id),
  checked_at    timestamptz not null default now(),
  hash_computed char(64) not null,
  matches       boolean not null
);
```

### 3. `extractions` — present/absent output, with byte-offset lineage

Extends the current `extractions` with the proves byte-offset idea: every present slot points at the
exact byte range in the snapshot it was read from (not just a hash). This is what makes "watch the
fingerprint form" literal — each piece highlights at its real offset in the source.

```sql
-- additions to the existing extractions table (or a per-slot lineage sidecar):
alter table extractions
  add column snapshot_id      uuid references snapshots(id),  -- wasDerivedFrom (PROV)
  add column doi              text;

-- per-present-slot lineage (one row per captured piece) — adapts proves
create table extraction_lineage (
  id               bigserial primary key,
  extraction_id    uuid not null references extractions(id),
  field_path       text not null,                   -- e.g. "parameters[5].value"
  quote            text not null,                   -- verbatim source text
  quote_sha256     char(64) not null,               -- per-piece hash (we already compute this)
  snapshot_id      uuid not null references snapshots(id),
  byte_offset      integer,                         -- WHERE in the snapshot the quote sits
  byte_length      integer,
  page             int,
  lineage_verified boolean default false,           -- did re-reading the span re-hash equal?
  verified_at      timestamptz
);
```

## The lifecycle

```text
queued
  → resolving        (Crossref: metadata + licence gate)
  → rejected_licence (not open → STOP, never fetched)        [terminal]
  → fetching         (TDM endpoint per publisher)
  → snapshotted      (RAW bytes stored + served_sha256 — the pristine provenance moment)
  → normalized       (derive text layer from raw; re-derivable; offsets point here)
  → extracting       (OpenAI present/absent against the text)
  → done             (extraction + per-piece byte-offset lineage written)
  → failed           (retry w/ exponential backoff; dead-letter at max_attempts)
```

## What we took from proves (verified against its real migrations)

- `raw_snapshots` → `snapshots` (the retained source artifact + hash + when/where).
- `urls_to_process` status lifecycle + queue → `doi_queue`.
- `staging_extractions.evidence_checksum + evidence_byte_offset + evidence_byte_length` →
  `extraction_lineage` (byte-range provenance — stronger than our quote-hash alone).
- `validation_decisions` → already mirrored by our `review_decisions`.
- Deliberately NOT taken: the multi-org/`organizations` tables (single-team), the knowledge-graph
  tables (`core_entities`, `staging_relationships`, `entity_alias`), and the `knowledge_epistemics`
  7-question sidecar (proves' ontology, not ours).

## Open items (verify before building)

1. **TDM access mechanism + which open sources.** Confirm the institution's TDM API key and which
   open-access endpoints we hit (PLOS, Springer OA, PMC, arXiv, DOAJ-listed). Per-publisher return
   formats differ (XML vs PDF) — the snapshot store is format-agnostic to absorb that.
2. **Open-licence detection rule.** Exactly which Crossref `license[]` URLs count as "open" (CC-BY,
   CC-BY-SA, CC0…). Needs a concrete allow-list.
3. **Supersedes prior intake artifacts.** The `papers` table, `uploadPaper`, the public `papers`
   bucket, and the dashboard drop-PDF UI are replaced by this DOI-snapshot model. A migration will
   add these tables; the old upload path is retired.
4. **Raw-bytes location.** Small served bytes (XML/text) in `content_raw` (`bytea`); large/binary
   served bytes (a PDF blob) in object storage via `raw_storage_key`, with `served_sha256` in the row.
   The derived `content_text` is always in-row.
5. **Text normalizer.** Which tool derives `content_text` from each `served_format` (a JATS-XML
   reader; a PDF text-extractor for PDF blobs). Recorded per-snapshot in `text_extractor`.

## Sources

- proves schema: `C:\Users\Liz\PROVES_LIBRARY\supabase\migrations\` (000, 001, 002, 022).
- Crossref REST API + link[]/license[] — api.crossref.org; crossref.org/documentation/retrieve-metadata/text-and-data-mining/
- Provenance standards — WARC (ISO 28500), W3C PROV-O, NDSA fixity.
- Queue pattern — Postgres FOR UPDATE SKIP LOCKED; AWS exponential-backoff-and-jitter.
