---
title: "Dashboard surface specs — Intake · Process · Verifier · Library"
status: AGENT DRAFT — awaiting Liz validation
type: UI/product spec (per-surface)
generated_by: dev agent (Claude Code), synthesizing 4 parallel readers of Lizo-RoadTown/proves-curation-dashboard
human_input: >
  Liz directed which four surfaces to spec (agent health, ingestion, human verifier, library) and set
  the filter: reuse proves' UI/interaction patterns, NOT its ontology; not every human-in-the-loop piece
  carries over. The fit-to-our-model judgments are the agent's, for Liz to check, correct, and promote.
date: 2026-06-05
validated_by: (pending — Liz)
serves_canon: 2026-06-05-document-architecture-canon.md
---

# Dashboard surface specs

Four surfaces, each = a proves surface **stripped of ontology and re-anchored to our model**: the unit
is a `(paper, figure)` pair; every slot is a forced **present / absent(+subcategory)**; the **figure is
the verification oracle**; input is a **PDF only**.

**Shared foundation (reuse proves wholesale — it's proven):** React + Vite + TypeScript + Tailwind +
shadcn/ui + **Supabase** (auth = the gate, Postgres = the store, realtime = live updates, Storage =
the PDFs) + Vercel. Observability via **OTel → the-loom** feeds the Process surface.

**Locked 2026-06-05:** **single team** — drop proves' multi-org federation, per-org attribution, and
sharing-status; the gate is a simple login and headers carry no org switcher.

**The one thing proves never had, and we must build (flagged by the verifier reader):** an actual
**PDF viewer with offset-anchored source highlighting** + a **figure-comparison pane** (paper figure
vs. regenerated-from-values figure). proves' grounding is shallow (quote + link + raw offsets, no
jump-to-span). For us this is *central*, not optional — it's where present/absent and figure-match
actually happen.

---

## End-to-end agent flow (the spine these surfaces sit on)

1. **Extractor** (Pydantic-constrained) maps every slot to **present / absent(+subcategory)**. On a
   slot it accepts, it records the value; our pipeline attaches the **checksum lineage**.
2. **Verifying agent** (machine) re-checks lineage + schema + figure-repro, then **escalates to the
   human only what needs human eyes** — packaged with **lineage, proof, and a link to the PDF**. The
   machine clears what's provable; the human sees the rest.
3. **Human verifier** confirms present/absent + figure-match on the escalated items.
4. **Self-update loop** (same as the curation's): the extractor/verifier agents **propose their own
   improvements**, a human approves/rejects, trust accrues — so the agents get better at *where to
   look* over time.

---

## 1. Intake (proves "Ingestion / Admin")

**Purpose (our model):** accept one paper **PDF** (the only input), fingerprint it at the door, and
launch one extraction job **per `(paper, figure)` target**.

| Borrow (pattern) | Drop (proves ontology/plumbing) |
|---|---|
| Job-monitor layout: stat cards (Queued / Processing / Done / Failed) + recent-jobs list with per-row status, progress, relative time (`IngestionSection`) | The entire **connector taxonomy** — GitHub/Discord/Notion/GDrive/URL-list source types, `AuthMethod`, OAuth |
| `trigger → poll task status → refresh` async loop (`triggerCrawl`/`waitForTask`) | **Crawl semantics** — schedules, depth, recursion, include/exclude globs, change-tracking/diffing on re-crawl |
| Supabase **realtime** row updates; per-row actions (retry/cancel) | **DiscoverySection** + `/discover` (AI page-ranking) — we already have the document |
| Tenant isolation discipline (lighter) | The two-step "pick a connector" dialog (no connectors here) |

**Components (ours):** `IntakeView`, `PdfDropzone` (upload or paste URL), `IntakeQueue` (the job
monitor), `FigureTargets` (after upload, the engine **enumerates the figures it finds and the user confirms** which to extract — since unit = figure).

**Data model (ours):**
- `paper`: `file_sha256`, `doc_root_sha256`, `parser_id`, `page_count`, `filename`, `uploaded_at`, `status`.
- `extraction_job`: `paper_id`, **`figure_ref`** (the target figure), `status` ∈ `queued → parsing(PDF→math) → extracting → verifying → done | failed`, `current_stage`, `progress`, `error`. (proves' `CrawlJob` shape, minus crawl fields, plus `figure_ref`.)

**Our-model specifics:** SHA-256 fingerprint computed on upload (provenance root); first job stage is
**PDF→math** (Marker/Mathpix/GROBID); one job per `(paper, figure)`.

---

## 2. Process (proves "Agent Health / Mission Control")

**Purpose (our model):** watch the engine work — per-job pipeline status + the OTel traces that show
*what it's calculating*. Read-only.

| Borrow | Drop |
|---|---|
| **`PipelineFlow`** — real-data linear stages with status colors, per-stage queue badges, throughput (this is the gold; it's the only real-data pipeline viz) | The **5-university pipelines** + per-org **HeatMap** federation |
| `usePipelineStats` / `useOrgActivity` **RPC-poll** pattern (15–30s) | The **knowledge-graph centerpiece** (`Graph3D`) — we have no graph |
| `RadialBarChart` **gauges** (`AgentOversight`) for headline metrics | The **6-agent fleet roster** (Extractor/Validator/**Linker/Deduper/Enricher**/Exporter) |
| *(optional)* motion-as-health encoding, decoupled from the agent roster | The proves **agent roster** (Linker/Deduper/Enricher) and the **proves-domain proposal content** (`capability_type: ontology_expansion`, etc.) |
| **The self-update loop — KEEP (Liz: "same loops for self updating that the curation had").** `agent_capabilities` / `agent_proposals` / `agent_trust_history`, approve/reject → trust-delta. Agents propose improvements (better **sourcing prompts**, thresholds); human approves; trust accrues. Keep the machinery; swap only *what* is proposed to fit our model. | — |

**Components (ours):** `ProcessView` with a `PipelineFlow` over **our** stages —
`Ingest → PDF→math → Extract → Machine-verify (hash + schema + figure-repro) → Human-verify → Stored`
— plus a jobs table and gauges (throughput, **figure-repro pass-rate**, **present/absent ratio**, avg
verify time). **Per-job trace drill-down** is where OTel/loom lives: the `ingest.hash` / `parse.page`
/ `extract.piece` / `verify.lineage` spans render here ("see what it's calculating").

**Our-model specifics:** stages mirror our pipeline exactly; status fed by **OTel (loom) + Supabase job
rows**; figure-repro pass/fail and per-extraction present/absent counts are first-class health signals.

---

## 3. Verifier (proves "Review / EngineerReview / ExtractionDetail")

**Purpose (our model):** the narrow **present/absent + figure-match** verifier. The reviewer does **not**
see the raw pending queue — they see an **escalation inbox**: the verifying agent has already cleared
what's machine-provable and surfaces only what needs human eyes, each item arriving **with its lineage,
proof, and a link to the PDF**. For each escalated slot the reviewer confirms *present or absent* against
the source, corrects values, and checks the captured value-set **reproduces the figure**. (This surface
is the richest proves match — and the one with the critical build gap.)

| Borrow | Drop |
|---|---|
| Queue → detail nav (`PendingExtractions` → `ExtractionDetail`) | The **7 "Knowledge Capture Questions"** (epistemics) — entirely |
| **Editable payload + `computePayloadDiff`** before/after dialog | **FRAMES / coupling** (`from → via → to`, "what flows") |
| Evidence block: quote + source link + offset/checksum | **Ecosystem** classification; **multi-org provenance** |
| **Separate `record_review_edit` then `record_review_decision`** write-back | **Duplicate-check / merge** against an entity library |
| Realtime list refresh | The **deep rejection taxonomy** (→ replace with our tiny set) |
| **Field-level 👍/👎 gating** (`MobileReview`/`ReviewForEngineers`) → maps DIRECTLY onto per-slot **present/absent** | Confidence-override + source-flag; training-loop framing |
| Mobile single-card prev/next/progress flow | |

**THE BUILD (proves has none of this — flagged by the reader):** a real **PDF-viewer pane with
offset-anchored highlight** (jump to the exact span a value came from), plus a **figure-comparison
pane** (paper's figure vs. the figure regenerated from the captured values). LangExtract for
character-level grounding; Mathpix-Markdown to render math.

**Components (ours):** `VerifyQueue` (pending `(paper, figure)` extractions); `VerifyDetail` =
(a) **PDF viewer** with highlighted source spans, (b) the extracted slots, **each a present/absent
control + subcategory-on-"no" + value + meaning + edit**, (c) **figure-match pane**, (d) decision:
approve / send-back.

**Data model (ours):** the review payload **is our `VerifiedExtraction`** (slots carry yes/no +
subcategory). The rejection set shrinks to: **`absent`(+subcategory)**, **`value_mismatch`**,
**`figure_mismatch`**. Decisions/edits recorded via our analogues of `record_review_decision` /
`record_review_edit`.

**Our-model specifics:** the **per-slot present/absent control is the core interaction** (not a generic
field edit); the **subcategory dropdown appears on "no"** — **two only** (`not_stated` / `requires_inference`),
Liz collapsed the set for a simpler UI; **figure reproduction is the headline check**; offset-anchored
source highlight is **mandatory**, not nice-to-have.

---

## 4. Library (proves "Library")

**Purpose (our model):** browse/search **verified** `(paper, figure)` extractions — the structured archive.

| Borrow | Drop |
|---|---|
| `SearchBar` (icon + clear + Enter); `Facets` dropdown-row + Clear | **Knowledge-graph** model — `core_equivalences`, "Connections" gauge, the deferred 3D graph, the `KnowledgeMap` "graph" framing |
| Tile-grid → drill-in list nav; `TileIndexView` tabbed/sorted cards with excerpt + source link | **Spacecraft facet vocab** (Missions / Teams / Artifact types) |
| `useLibrary` hook shape (FTS + filtered list + counts) | **Org/team attribution** + "By Team" sort |
| Postgres **FTS** via `.textSearch(…, {type:'websearch'})`; `RadialBarChart` stat gauges | The 5 fixed knowledge tiles; mocked `referenceCount`/`needsReview`/`domain` |

**Components (ours):** `LibraryView`, `SearchBar`, `Facets` (**locked vocab**: pathogen/disease, formulation
family (Allen — vocab TBD, citations unverified), journal/year, **model features** —
compartments present / noise type / # state variables), tiles (by disease or model class),
`TileIndexView` (drill-in list), record card = paper title + figure + pathogen + DOI + status + **figure
thumbnail**.

**Data model (ours):** a library record = a row from our `extractions` table (the `VerifiedExtraction`
JSONB + indexed columns: `pathogen`, `doi`, `figure_ref`, `status`, `file_sha256`). Search = Postgres FTS
on title/pathogen now; **semantic / structured cross-paper query later** ("all models with a vaccination
compartment").

**Our-model specifics:** a record **is** a `(paper, figure)` pair; show the **regenerated figure
thumbnail**; you browse **already-verified** records (so "needs review" inverts to a `verified` status).

---

## Decisions (locked 2026-06-05)

1. **Auth/gate** — **single team.** Drop proves' multi-org federation; simple login gate.
2. **Intake figure-targeting** — **engine enumerates, user confirms.**
3. **Verifier subcategories** — **two only** (`not_stated` / `requires_inference`). Liz collapsed the
   four for a simpler UI. *Consequence:* the `x → x̄` "trace_incomplete" case now logs as
   `requires_inference`, so we lose the "recoverable / route-back" signal — acceptable for MVP; revisit
   if the verifier needs to distinguish "I couldn't finish tracing" from "it can't be traced."
4. **Library facets** — pathogen/disease, formulation family (vocab TBD), journal/year, model features.

## Still open

- **The build (PDF-viewer + figure-compare):** the one piece proves can't give us and the heart of
  present/absent + figure-match. Likely the first real engineering effort.
