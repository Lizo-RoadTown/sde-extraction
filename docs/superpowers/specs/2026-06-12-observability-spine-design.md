# Observability spine — the dashboard's organizing principle

*Approved direction, Liz 2026-06-12. Runtime (`apps/dashboard/`). This is THE design
principle for the entire UI, not one feature. See loom
`sde_extraction_observability_spine_2026_06_12`.*

## The principle

**The dashboard is an observability instrument.** Its job is to make every place a piece
of data crosses from one interface to another **observable, governed, and
provenance-tracked** — the transparency/reproducibility mission made literal in the UI.

The hard constraint (Liz): it stays **one smooth transaction** for the user — NOT a tab
per transfer (the database alone touches data through many layers; you'd drown in tabs).
Instead, at each boundary the data's **governance artifact is surfaced inline** —
identified, easily seen, never skipped, easily understood. "They need to know each hash."

The SHA-256-on-upload already built is the **seed**: PDF lands → its fingerprint shows,
identified, right there. The whole UI extends that pattern to every transfer.

## The transfers (the boundaries to make observable)

| # | Transfer | Governance/provenance artifact (what's surfaced inline) | Exists today? |
|---|---|---|---|
| 1 | PDF bytes → app | `file_sha256` (SHA-256 of exact bytes) | ✅ `fingerprintFile` in data.ts; `Provenance.file_sha256` |
| 2 | PDF → canonical text | `doc_root_sha256` + `parser_id` (determinism guarantee) | schema has fields; parser not built (OpenAI file input today) |
| 3 | text → OpenAI | model id + the exact prompt (the canon rules sent) | `processor.py` (MODEL + SYSTEM_PROMPT) — not surfaced in UI |
| 4 | OpenAI → each slot | per-slot: verbatim quote + page + **per-piece SHA-256** | ✅ `checksums_for` hashes each present slot's quote |
| 5 | slots → DB | the stored `VerifiedExtraction` row + its lineage shas | ✅ worker `write_extraction` |
| 6 | DB → human review | the present/absent decision the human makes (+ edits) | ✅ Verify surface; `review_decisions`/`review_edits` |
| 7 | review → library | the human verdict that promotes it to `verified` | ✅ status transition |

Each row = a window. The design weaves its artifact into the smooth flow, labeled.

## Feature 1 — "Watch the fingerprint form" (transfer #4, the centerpiece)

Liz's vision: the fingerprint must not be a **phantom number**. The user should watch it
**assemble from their own data** — a journey through the paper, the agent tagging each
piece it finds and folding it into the hash, so the final fingerprint is something they
saw built from pieces they recognize.

Key realization: **the per-piece hashes already exist.** `checksums_for(model)` returns
`{field_path: sha256}` — one hash per present slot, each computed from that slot's verbatim
quote. The data for "a hash per piece" is already produced; today the UI collapses it into
one number. This feature **un-collapses it.**

### Version A — Reconstruction / replay (BUILD FIRST)

The extractor is a single OpenAI call returning the whole model at once
(`processor.py:98`), so we can't stream the journey live yet. Instead, after extraction,
**replay** the assembly:

- Walk the present slots in document order (by page, then position).
- For each: highlight its verbatim quote in the PDF pane, show the piece's value, and
  **compute/reveal its SHA-256 on screen**, tying the hash visually to *that* quote.
- Each piece's hash drops into a running "fingerprint" accumulator; when all pieces are
  folded, the accumulator equals the document fingerprint.
- Pace it as a journey (staggered, ~150–300ms per piece, respect reduced-motion); a
  scrubber/step control so the user can move through it.

Result: the user watches their fingerprint form from their data — slightly after the fact,
but the same data, the same hashes. Feels like the journey.

### Version B — Truly live streaming (DESIGN NOW, BUILD LATER)

Re-architect the extractor to emit each piece as it finds it (streaming / step-wise
agentic extraction), so the hash assembles in real time as the agent reads. Bigger backend
change (changes how the OpenAI call is structured). **Leave a clean seam:** the replay
component should take a *stream* of `{piece, quote, page, hash}` events; Version A feeds it
a pre-computed array, Version B feeds it a live stream — same component, same animation.

## Feature 2 — Layered-telemetry confidence (Extraction Health rework)

Liz: "every confidence piece will be given as many layers of telemetry as we can and
confidence scores for each one." And: drop the meta-talk; describe the **real telemetry**,
how **governance/provenance is captured per telemetry type**, and **how confidence is
computed from telemetry + feedback**.

So Extraction Health stops being "how's the engine doing" narration and becomes a concrete
description of the instrumentation:

- **Telemetry layers** — enumerate the real signals the system can capture per extraction,
  each with its own sub-confidence: e.g. schema-conformance (did structured output
  validate?), lineage-integrity (do the per-piece hashes re-verify against the source?),
  figure-reproduction (did captured values regenerate the figure?), human-verdict history
  (HITL pass/fail per tag), absent-rate sanity (does absence track the document?).
- **Per-type governance/provenance** — for each telemetry layer, a box/link: how is this
  signal's integrity captured and audited? (e.g. lineage = the SpanProof re-hash; HITL =
  `review_decisions`.)
- **Confidence computation** — show the formula plainly: confidence per (extractor ×
  dimension-value) is a function of these telemetry layers + accumulated human feedback
  (the per-dimension vector from the confidence pillar). Not a phantom 0.81 — a number you
  can trace to its inputs.

A service may be needed for real telemetry capture (OTel → loom is already referenced); the
UI describes what's captured and links to where, even before every layer is wired.

## What this means for structure (already done / pending)

- Papers surface (add + verify, one motion) — DONE (commit 0e65139). The observable
  markers get woven into it + the verifier.
- No tab-per-transfer. Markers are inline; the verifier already shows quote+page+sha per
  slot (the seed of transfer #4).
- Extraction Health = the telemetry/confidence instrument (Feature 2).

## Build order

1. **Replay fingerprint component** (Version A) — takes an ordered list of
   `{field_path, value, quote, page, sha256}` (from `checksums_for` + the slots), animates
   the journey + hash accumulation. Mount it in the verifier / on a fresh extraction.
   Stream-shaped props so Version B drops in later.
2. **Inline transfer markers** — surface the artifacts from the table above at each point
   (model+prompt for #3, parser_id for #2 when it exists, etc.), labeled.
3. **Extraction Health rework** — telemetry layers + per-type governance boxes/links +
   the confidence-from-telemetry+feedback explanation.

## Honest seams

- Replay uses real per-piece hashes but is post-hoc (not live) until the extractor is
  step-wise. Labeled as a replay, not pretended-live.
- Several telemetry layers aren't captured yet (need the OTel→loom service / the confidence
  compute). Extraction Health DESCRIBES them and links to where they'll live; it doesn't
  fake scores. Anything not-yet-live is marked.
- Confidence numbers stay marked "not yet live" until the compute exists (per the
  confidence pillar, still UNDER REVIEW).

## Out of scope (now)

- The live-streaming extractor (Version B backend).
- The confidence compute itself (the confidence pillar's own build).
- The Library MCP (separate, post-verified-data feature).
