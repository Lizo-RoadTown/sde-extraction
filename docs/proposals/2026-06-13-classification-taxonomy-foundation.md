# Classification taxonomy as the walkthrough foundation

*Proposal, Liz + Claude, 2026-06-13. Captures the walkthrough ORDER and the classification
(taxonomy) work that has to come first, grounded in what already exists in the repo. Refines
[the canonical 18-item pipeline spec](2026-06-12-command-driven-hooked-pipeline.md).*

## The walkthrough sequence (the order we build to)

The user's stated flow, locked here as the reference ordering:

1. **Ingest** the PDF.
2. **Rasterize** it with a script that also **forces every figure to be labeled and displayed**
   (render pages → images → enumerate the figures). This is the OpenAI-vision figure-enumeration
   front-end (we use OpenAI here, not NVIDIA — its CV NIMs are access-gated; see the spike
   memory). Rasterizing is the robust front-end: the model sees what a human sees.
3. The user **chooses one figure** → it's **displayed on the UI**.
4. On the backend, that choice **becomes the anchor** (one sub-figure, per the anchor canon).
5. **OpenAI** is deployed to **find the stochastic model that matches the figure** (the
   model-match). This needs a Pydantic class to identify+match — see **Step 1**.
6. **Variable sub-agents** locate the **initial conditions** that match the model's variables to
   that figure (match one to the other) — see **Step 2**.
7. **Parameter sub-agents** identify the **parameters and their values**, matched model↔figure,
   and know when to skip, when to say *absent*, or how to constrain — see **Step 3**.

Steps 5–7 each require a **classification foundation** so the matching is correct. That
classification work is the subject of this proposal.

## The governing principle: a deterministic web around a fuzzy reader

A PDF is inherently messy, and an LLM reads it nondeterministically. We cannot make the *reading*
deterministic — but we can make the *pipeline* deterministic by surrounding the one fuzzy
component (the LLM) with a **deterministic script at every layer**, so each LLM output is
**falsifiable by code at the seam where it is produced**. Not one script constraining all layers
— a script on *each* layer, forming a web (this is the nearly-decomposable seam model:
[2026-06-13-nearly-decomposable-observability.md](../architecture/2026-06-13-nearly-decomposable-observability.md)).

| Layer | The fuzzy part | The deterministic script/library that pins it |
|---|---|---|
| UI / choice | — | the anchor picker forces **one sub-figure** — no ambiguity about *which* graphic ([figures.ts](../../apps/dashboard/src/figures.ts)) |
| Ingest / document | — | rasterize at fixed DPI (PyMuPDF) + `file_sha256` fingerprint + forced figure labeling |
| LLM read | the reading | strict Pydantic `response_format`, temperature 0, the present/absent fork — constrains the *shape*, forbids nulls and invention ([processor.py:102-113](../../services/extraction/processor.py#L102)) |
| Match / route | which family / role | the match-or-add **classification registries** (Steps 1–3 below) — deterministic routing |
| Verify (per output) | — | locator verbatim-check (pdfplumber), reconcile + panel cross-check ([assemble.py](../../services/extraction/assemble.py)), SHA-256 lineage, 2nd-model audit, and the diffrax figure-repro oracle |
| Govern / observe | — | `validation_events` at each seam + the V1–V8 gates |

The rule this implies: **never ship an LLM output that no script can check.** "Deterministic"
here means *falsifiability at every seam* — the randomness is bounded, verified, and caught, even
though the read itself stays probabilistic. The classification work below is the deterministic
constraint at the **match** layer of that web.

## The crux: classification vs the present/absent canon

The approved canon ([2026-06-05-document-architecture-canon.md](../../Agent%20Drafts/sde-extraction-approach/2026-06-05-document-architecture-canon.md);
[schema.py:8-12](../../services/extraction/schema.py#L8)) says **we do not constrain the SDE forms — we constrain the document.**
Classification does **not** violate this, because it operates on a different layer:

| Layer | What it does | Constrained? |
|---|---|---|
| **Identification** (this proposal) | recognize *which family* a model is, *what role* a symbol/parameter plays, *what type* a figure is → so we can **route, match, and know what to look for** | yes — by a **self-growing registry** |
| **Value** (untouched canon) | the actual drift/diffusion expression, the numeric value, the meaning text | **no** — verbatim *present*, or reasoned *absent*; never invented |

The mechanism is the **match-or-add registry** already designed for figure types
([2026-06-12-figure-types-schema.md](../superpowers/specs/2026-06-12-figure-types-schema.md)):
the agent matches an observed thing to a known category **or proposes a new one** (human-audited),
so the taxonomy grows from real documents instead of being frozen up front. We extend that same
pattern to model families, variable roles, and parameter roles. A registry that grows ≠ an enum
that forces invention.

**Net rule:** classify to *identify and match*; never to *manufacture* an SDE form or a value.

## Step 1 — model + transformation classification

**Goal:** identify the stochastic model's family so it is matched to the figure correctly.

**Already exists (build on):**
- Prior-art formulation typology — diffusion approximation / chemical Langevin, environmental /
  parametric noise, demographic noise, Ornstein–Uhlenbeck parameter process — **citations marked
  UNVERIFIED** ([2026-06-01-prior-art-and-pipeline.md:87-105](../../Agent%20Drafts/sde-extraction-approach/2026-06-01-prior-art-and-pipeline.md)).
- `formulation_family` named as a Library facet but **not yet defined** (database.md:22).
- Itô vs Stratonovich noted as a **separate axis** (greenfield).
- `figure_type` / `outcome` are bare `str` today ([schema.py:148-149](../../services/extraction/schema.py#L148),
  [181](../../services/extraction/schema.py#L181)) — the slots a classifier fills.
- The self-growing `figure_types` table design (ready to build).

**Method:** harvest families from the completed ground-truth reviews (`AT3_review/reviews/completed/**`),
**verify the typology against the literature** (the deep-research-pattern playbook — confirm the
Allen citations before locking names), and encode as (a) a self-growing **model-family registry**
+ a **transformation axis** (Itô/Stratonovich, log-transform, nondimensionalization) and (b) a
Pydantic **classification class** whose fields are identification labels (`figure_type`,
`formulation_family`, transformation tags), not value constraints.

## Step 2 — variable / initial-condition classification

**Goal:** variable sub-agents match the model's variables to the figure's panels and locate each
initial condition (match one to the other).

**Already exists (build on):**
- `Variable` structure is **locked**: `symbol` (anchor) + `meaning: Slot` + `initial_value: Slot`
  ([schema.py:97-106](../../services/extraction/schema.py#L97)).
- The panel **checklist** drives one sub-agent per variable
  ([schema.py:140-166](../../services/extraction/schema.py#L140) `FigureRead.panels`, `VariableExtraction`).
- Real variable vocabulary in ground truth (Dengue OU: `S, I, V, Z, x` with the OU log-process).

**Method:** harvest variable **roles/meanings** from the completed reviews into a **seeded
reference glossary** (not a hard enum) so a sub-agent knows what role a symbol likely plays and
— crucially — when an initial condition is genuinely *not_stated* vs *requires_inference*. The
glossary informs the search; the value stays present/absent.

## Step 3 — parameter classification

**Goal:** parameter sub-agents identify parameters and their values, and know when to **skip**,
when to mark **absent**, or how to **constrain** the search.

**Already exists (build on):**
- `Parameter` structure is **locked**: `symbol` + `value: Slot` + `meaning: Slot` + `units: Slot`
  ([schema.py:109-119](../../services/extraction/schema.py#L109)).
- The canonical *absent* example: Dengue OU `x_bar` = "never stated explicitly" →
  `Absent(requires_inference)` — the discipline is approved and strong.

**Method:** harvest parameter **roles** (transmission rate, noise intensity, mean-reversion rate,
…) from ground truth into the reference glossary, plus explicit **rules** for the three sub-agent
decisions (skip a non-parameter symbol / mark absent / how tightly to constrain the value search).

## How it plugs into the pipeline (the seams)

- Steps 2–3's rasterize+label front-end → the figure-enumeration pass (OpenAI vision).
- Step 1 classifier runs at the **model-match** (seam S3 `extract` / the figure reader).
- Steps 2–3 feed the **per-variable** and **per-parameter** sub-agents (the fan-out).
- Each classification crossing should emit a `validation_events` hook (the seam-map discipline)
  so we can watch match quality and learn governance rules.

## What stays greenfield by design

The **SDE form** itself and the free-form **meaning vocabulary** remain paper-discovered, never
enumerated — exactly the canon. The glossaries are *reference*, not *constraint*.

## Next action

Begin **Step 1**: build the model-family registry by harvesting `AT3_review/reviews/completed/**`
and verifying the formulation typology against the literature, then draft the Pydantic
classification class (identification fields only). Steps 2 and 3 follow the same harvest-then-encode
method.
