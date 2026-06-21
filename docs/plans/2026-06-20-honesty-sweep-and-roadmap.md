# Honesty sweep + roadmap — 2026-06-20

Captured, not yet executed. Source: two read-only honesty audits (dashboard + docs) run 2026-06-20,
each cross-checked against code. Governing rule: **if it isn't true, it doesn't go on the site — only
honest things; honestly-labeled drafts/previews are fine, pretense is not.** (See memory
`site-honesty-sweep-rule`.)

Two kinds of fix:
- **Fabricated** (a constant/placeholder shown as a live measurement) → **remove**.
- **Built-but-not-live** (real, intended, just not wired) → **relabel as planned**, matching how
  AgentHealth / the dev docs already speak.

Status legend: ☐ not started · ◐ in progress · ☑ done

## Progress — 2026-06-20 (autonomous session)

**Phase 1 done** — built real signals where the feature was wanted, didn't gut:
- Dashboard: fake confidence → real **completeness** (present/absent, `slotCounts`); verify queue
  ordered least-complete-first; Library shows completeness + honest "human-verified" badge; **real**
  Library search + Pathogen facet (from data); header pill → **real telemetry heartbeat**. (test branch)
- Docs: reproduction + earned-confidence relabeled **planned**; pages lead with the real completeness
  signal; `figure_reproduced` noted null. **Published to `main`** (corrected claims that were live).
- `/fingerprint`: left as the unlinked dev sandbox (not user-facing).

**Phase 2 finding:** reproduction (#10) can't be wired without first building the verbatim→executable
**transform** step (`drift_code`/`diffusion_code` aren't in the live model) — a delicate core
capability; left for a hands-on session, not autonomous.

**Still live on production (`main`):** the dashboard honesty fixes are on `test/dagster-skeleton` only
(entangled with the path-selector / orchestration work — can't cherry-pick cleanly), so production's
dashboard still shows the old fake confidence until the branch merges. **Decision needed: merge
`test/dagster-skeleton` → `main`, or a staged landing.**

---

## Phase 1 — Honesty sweep (make the site true *now*)

### 1A. Dashboard (runtime — `apps/dashboard/`)

| # | Item | Evidence | Action | Status |
|---|------|----------|--------|--------|
| 1 | Fake confidence scores shown on real data, and they silently sort the verify queue "riskiest first" | `ui.tsx:64-77`, `surfaces/Verify.tsx:258-260`, `surfaces/Library.tsx:62` | **Remove** the chip + the confidence-based sort (fall back to load/newest order) until a real score exists | ☐ |
| 2 | Library "verified ✓" badge keys off `figureReproduced` (an oracle not in the live path) | `surfaces/Library.tsx:63` | **Drop** (all Library rows are already human-verified) or relabel "reproduction: not run yet" | ☐ |
| 3 | Header "engine + loom: live" pill is hardcoded — no probe | `App.tsx:109-112` | **Remove** the "live" claim, or wire a real heartbeat (last `validation_events` ts) | ☐ |
| 4 | Library search box + Pathogen/Year facet dropdowns are non-functional; options are invented | `surfaces/Library.tsx:13-45` | **Remove/disable** until faceted search is real | ☐ |
| 5 | `/fingerprint` sandbox renders fabricated scatter positions | `surfaces/FingerprintJourney.tsx:45-47`, route `App.tsx:46` | **Leave** (unlinked dev route) or delete; do not promote without real `rect`s | ☐ |

### 1B. Docs site + README (dev-tooling — `apps/docs/`, `README.md`)

| # | Item | Evidence | Action | Status |
|---|------|----------|--------|--------|
| 6 | Figure **reproduction / re-drawing** stated as live; oracle is built+tested but the live worker never calls it (ends at locate+store, never writes `figure_reproduced`) | `index.mdx:35-36`, `start/reproduce.md:48-51`, `explanation/observability.md:27`, `README.md:16-17`; code: `worker.py:179-189`, `oracle.py` uncalled | **Relabel as planned / "not yet in live path"** everywhere | ☐ |
| 7 | `public-api.md` documents `figure_reproduced` as a populated fact (incl. `?figure_reproduced=is.true` example); it is null in the live path | `how-to/public-api.md:35,83` | **Correct** — note the field is currently unpopulated; drop the `is.true` example | ☐ |
| 8 | "Earned confidence" feedback loop described as a working mechanism; no confidence code exists in `services/` | `explanation/confidence.md:24-27`, `explanation/agent-health.md:26-33` | **Relabel as planned** | ☐ |
| 9 | Per-part confidence promised to users, but the app deliberately shows none (ExtractionHealth shows only real telemetry) | `explanation/confidence.md:11-17`, `start/reproduce.md:57`, `explanation/recognizes.md:13-14` | **Correct/relabel** — not currently surfaced | ☐ |

> After 1A/1B: build + schema-guard + dashboard typecheck, then **publish the docs fixes to `main`**.

### Verified honest (left untouched)
Fingerprint-on-upload, figure detection, the locator / magnifying glass (and its honestly-scoped OCR
"not built" note), "not stated"/never-invent, the public API view, the preview toggle, and everything
already labeled "planned / not run yet / draft."

---

## Phase 2 — Make the relabeled claims *true* (capabilities)

Doing these flips the Phase 1 "planned" labels back to honest "live."

| # | Item | Notes | Status |
|---|------|-------|--------|
| 10 | Wire the diffrax reproduction oracle into the live worker | `oracle.py` exists + tested; worker must call it and write `figure_reproduced`. Then un-relabel #6/#7. | ☐ |
| 11 | Implement earned-confidence | read `validation_events` back into a per-type trust score; surface it. Then un-relabel #8/#9. | ☐ |

---

## Phase 3 — Magnifying glass continuation

| # | Item | Notes | Status |
|---|------|-------|--------|
| 12 | Confirm the locator fix live in the UI | re-open a backfilled extraction; lens lands on real words; unlocated show "· no position" | ☐ |
| 13 | Recover residual locator misses | backfill left 185 unlocated (some extractions 0/N); classify raster (`no_text_layer`) vs page-window misses; tighten matcher | ☐ |
| 14 | Build the OCR fallback tier (scanned/raster pages) | rasterize → OCR word boxes (Surya/docTR open-source, or NVIDIA NIM region+OCR) → same quote→box matcher. NVIDIA gives region/line boxes only, not scalar boxes — fallback source, not a replacement. | ☐ |
| 15 | Flesh out the locator doc `_(expand)_` sections + lens screenshot | `explanation/magnifying-glass.md`, `dev/logic/position-locator.md` | ☐ |

---

## Done already (this session, for context)
- Locator rewrite (PyMuPDF `search_for` + numeric anchor + all-pages + honest reasons); 0/5 → 5/5 on the reference paper.
- Killed `scatter()` in `SpotlightQuest` — unlocated values show "· no position", no fake lens.
- `backfill_locations.py` ran on public: 411 real positions across 15 extractions.
- Published the two locator doc skeletons to `main`.
- Two extraction paths (public / dagster_app), Dagster orchestration capture, worker deployed.
