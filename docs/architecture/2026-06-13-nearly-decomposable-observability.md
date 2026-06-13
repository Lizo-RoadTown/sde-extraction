# Nearly-decomposable architecture + the seam map (the observability foundation)

*Principle doc, Liz 2026-06-13. Grounds SDE_Extraction's modular build + observability in
Herbert Simon's nearly-decomposable systems ("The Architecture of Complexity," 1962). The point:
build as near-independent modules, and put telemetry/governance on the SEAMS between them —
that's how it scales and how we guarantee we can see every place data moves.*

## The principle (Simon)

A complex system is **nearly decomposable** when it's a hierarchy of subsystems where
**interactions WITHIN a subsystem are strong/frequent and interactions BETWEEN subsystems are
weak — but not zero.** Consequences we build on:

1. **Short run:** each subsystem behaves approximately independently (its own dynamics dominate).
2. **Long run:** subsystems interact only through **aggregate/summary variables** at their interfaces — not internal detail.
3. **Watchmaker parable:** systems built from **stable sub-assemblies (modules)** are robust to interruption and evolve far faster than monolithic ones.

Design corollaries for us:
- **Modules**: each pipeline stage is a cohesive, single-purpose unit (high internal cohesion, low coupling). Swap/repair one without touching the others.
- **Summary interfaces**: stages exchange typed *contracts* (Pydantic) — aggregate results, not internals.
- **Observe + govern at the seams**: the weak inter-subsystem couplings (the data-transfer points) are where cross-system behavior is legible. That is exactly where telemetry (`validation_events`) and the validation gates (V1–V8) belong.
- **Telemetry richness ∝ coupling strength**: a form-preserving move (1→1) needs thin telemetry (intact? moved?); a transform/fan-out (1→many, new form) needs rich telemetry (type · count · speed · integrity-per-piece).

## The subsystems (the "drawers" — where data rests, in a form)

| Subsystem | data's form | code |
|---|---|---|
| **Source / file store** | PDF bytes + `papers` row | `apps/dashboard/src/data.ts` `uploadPaper`; Supabase `papers` bucket + table |
| **Job queue** | a command (`extraction_jobs.target` = mode/figure_ref/lane) | `db.py` `claim_next_job`; `data.ts` `enqueueJob` |
| **Extractor (LLM)** | figure + reasoning → present/absent slots | `processor.py` `run` |
| **Deterministic scripts** | slots → located/reconciled/cross-checked | `locator.py` `annotate_locations`; `assemble.py` |
| **Database** | rows (`extractions`, later `extractions_staging`) | `db.py` `write_extraction` |
| **Human / review** | the V8 verdict | `data.ts` `submitVerdict`; `review_decisions` |
| **Library** | verified models | `data.ts` `loadLibrary` (status='verified') |
| **Telemetry sink** | the seam observations | `validation_events` (migration 0005); `hooks.py`, `db.py` `record_validation_event` |

## The seam map — EVERY place data transfers, in order

This is the checklist that ensures no data-movement goes unobserved. Each seam declares its
**coupling type** and its **telemetry profile** (which aggregate variables it reports).

| # | Seam (interface) | coupling | telemetry profile | status |
|---|---|---|---|---|
| S1 | bytes → file store (`papers`) | move (1→1, form-preserving) | integrity (`file_sha256`), latency | live (hash on upload) |
| S2 | intake choice → job queue | move (a command) | which command (mode/figure/lane), enqueue ok | live (`enqueueJob`) |
| S3 | PDF → extractor → slots | **transform / fan-out (1→N, new form)** | **type · count (vars/params/drift/diff) · speed · schema-valid** | live hook `point=extract` |
| S4 | slots → located (on the PDF) | enrich (per-piece) | located/missing **count**, confidence tier, latency | live hook `point=locate` |
| S5 | per-variable → reconciled model | merge (N→1 dedup) | params in/out, collisions resolved | designed (`assemble.py`) |
| S6 | model vs figure panels | check (completeness gate) | captured vs panels, **missing** | designed (`crosscheck`) |
| S7 | assembled → verifier (2nd model) | audit | per-slot verdict, pass/flag | designed (verifier stage) |
| S8 | result → database (staging) | move (store-it-all) | rows written, lineage ref | live hook `point=store` (→ staging in v2) |
| S9 | staging → human → verified (V8) | **gated promotion** | approve/send-back, who, reason | partial (`submitVerdict`; staging promo in v2) |
| S10 | verified → Library | move | count promoted | live (status transition) |

The richest seam is **S3 (PDF → slots)** — your "one PDF becomes a thousand pieces in a new
form" — so it carries the most telemetry. The moves (S1, S2, S8, S10) carry thin telemetry.
That asymmetry IS near-decomposability: strong couplings get rich aggregate telemetry; weak
ones get little.

## How the modules implement near-decomposability

- **Stages = modules** (orchestrator + single-purpose sub-agents + deterministic scripts) — the watchmaker's stable sub-assemblies; a failed sub-agent + checkpointer resume doesn't collapse the run.
- **Contracts = summary interfaces** (`schema.py`, `contracts.py`) — stages pass aggregate results, not internals.
- **`validation_events` = the seam telemetry** (migration 0005) — one row per seam crossing: `point` (which seam), `subject_kind` (script|agent|human), `outcome`, `latency_ms`, `lineage_ref`, `tags` (type/count/tier…). This is Simon's "interact via aggregate variables," recorded.
- **Validation gates (V1–V8) = governance at the seams** — rules execute exactly on the weak couplings, the only places where cross-system behavior is legible enough to govern.

## The observability shape (Extraction Health)

Not bar graphs. A map of **drawers as zones**, **seams as living connectors**, in order:
- a **move** draws as one solid pipe + integrity dot;
- a **transform/fan-out** (S3) draws as one strand **bursting into many** — particles streaming PDF→DB, where **count ≈ particle count, throughput ≈ flow speed, type ≈ color, lineage ≈ a glyph**. The telemetry *is* the shape.

## Design rules going forward (enforce modularity)

1. **Every new capability is a module** with high internal cohesion + a **typed summary interface** — never reach into another module's internals.
2. **Every seam emits a `validation_events` hook** — if data crosses a boundary and isn't observed, the seam map is incomplete; add it.
3. **Telemetry richness matches coupling**: thin for moves, rich (type·count·speed·integrity) for transforms/fan-outs.
4. **Governance rules attach to seams** (the gates), informed by what the seam telemetry shows.
5. **New seams get added to the table above** — this map is the source of truth for "all the areas we need to see data."

Refs: [observability-spine-design.md](../superpowers/specs/2026-06-12-observability-spine-design.md),
[validation-points-map.md](../superpowers/specs/2026-06-12-validation-points-map.md),
[command-driven-hooked-pipeline.md](../proposals/2026-06-12-command-driven-hooked-pipeline.md).
Simon 1962: faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/ArchitectureOfComplexity.HSimon1962.pdf
