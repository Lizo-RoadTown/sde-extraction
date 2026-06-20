# SDE_Extraction

Automated extraction of stochastic-differential-equation (SDE) epidemiological models from academic
papers into structured, present/absent models — with re-simulation to check the paper's figure can be
reproduced as the planned final gate (the harness is built and tested; not yet in the live run). A
human verifies every result. Wired into the-loom (project intelligence + memory MCP + observatory).

## What it does

1. A paper is uploaded. The system finds its figures; a person picks the one figure they want the
   model for.
2. The extraction brain (OpenAI + Pydantic) reads the model behind that figure into a structured,
   present/absent form — every value carried with its quote, page, and a hash of its source.
3. Each term's lift off the page is recorded (the recorded transformation), so nothing is a black box.
4. _Planned:_ the model is re-simulated with the BioModels curation harness (diffrax, fixed seed) —
   running it twice and getting the same result is the reproducibility check, a verdict only ever set
   from a real run, never guessed. The harness is built and tested, but turning the lifted values into
   an executable model is not yet wired into the live run.
5. A person reviews the result before it is kept. (A per-type confidence score _earned_ from those
   human verdicts is planned; today each extraction shows its real completeness — present vs absent.)

## Architecture

| Surface | Where | What |
|---|---|---|
| `apps/dashboard` | React + Vite, Vercel | the app: upload, choose figure, watch it work, verify, library |
| `apps/docs` | Astro Starlight, Vercel | public documentation for scientists |
| `services/extraction` | Python + Docker, Render | the worker: polls Supabase, runs the OpenAI+Pydantic brain; holds the schema, classification registries, recorded-transformation machinery, figure detection, and the reproduction oracle |
| `services/orchestration` | Dagster, self-host | the deterministic backbone (skeleton): a dynamic-task-mapping DAG running each deterministic stage as an observable node, with a per-variable fan-out; autonomy confined to subagent nodes |
| Supabase | Postgres + storage | data + a read-only public API (`public_models` view) |
| `plugins/sde-extraction-guard` | Claude Code plugin | hook-enforced schema guard (`scripts/check_schema.py`) |

The OpenAI + Pydantic extraction brain is the core and is not replaced; external tools are borrowed for
their architecture, not their models.

## Layout

```text
SDE_Extraction/
├── apps/
│   ├── dashboard/                   React/Vite app (Vercel)
│   └── docs/                        Astro Starlight docs site (Vercel)
├── services/
│   ├── extraction/                  Python worker + brain, schema, classification, transform, figures, oracle
│   └── orchestration/               Dagster orchestrator (deterministic backbone)
├── supabase/migrations/             Database schema (0001..; 0012 = public read-only API)
├── scripts/check_schema.py          The schema guard (run by the guard plugin)
├── plugins/sde-extraction-guard/    The guard, as a hook plugin
├── docs/
│   ├── proposals/                   Design decisions before code
│   ├── decisions/                   ADRs
│   ├── architecture/                Living architecture docs
│   ├── plans/                       Dated execution plans
│   └── test-runs/                   Friction-surface logs
├── skills/ · skills_private/        Bundled methodology skills
├── AT3_review/                      READ-ONLY reference (prior HITL review system; git-ignored)
├── .project-intelligence/           Loom instance state (sde-extraction-dev)
├── CLAUDE.md                        Project context auto-loaded by Claude Code
└── README.md                        This file
```

`AT3_review/` is read-only reference, not part of the runtime. `Agent Drafts/` vs `Human validated/`
record the human-in-the-loop division of labor (agents write drafts; only Liz promotes to validated).

## Discipline plugin (required)

```text
/plugin marketplace add Lizo-RoadTown/claude-skills-marketplace
/plugin install make-skills-discipline@lizo-skills
```

(Being renamed to `loom-discipline`; either name works during the transition.) The plugin enforces
PROBE-before-asserting, file:line citation, dev-tooling-vs-runtime distinction, friction-as-memory
writes, skill-citation, and the layered-explanation pattern.

## Setup (loom integration)

1. Clone and `cd` into the repo; install the discipline plugin (above).
2. Copy `.env.template` to `.env` and fill in `LOOM_PROJECT_ID=sde-extraction-dev` plus the OTEL
   exporter endpoint/headers (copy from `the-loom/.env`).
3. Open in Claude Code. The plugin loads, `memory_recall` surfaces prior context, telemetry flows to
   Grafana tagged `project_id=sde-extraction-dev`.

See [`docs/architecture/loom-wiring.md`](docs/architecture/loom-wiring.md) for the integration map.

## Methodology skills (bundled)

In `skills/` and `skills_private/`. Most relevant: `deep-research-pattern`, `eval-deep-research`,
`document-parsing`, `documentation`, `layered-explanation`, and (private) `proposal-authoring`,
`lessons-learned`, `agentic-upskilling`. Invoke skills by name (per the discipline plugin).

## License

Apache 2.0 — see [LICENSE](LICENSE).
