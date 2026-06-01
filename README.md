# SDE_Extraction

**Status:** 2026-05-31 — seeded. Heavy-research phase incoming. Web/UI components possible later.

A research-heavy project. Starts with deep literature/data work; may grow into a full application with backend + frontend + website over time. Wired into the-loom (project intelligence + memory MCP + observatory) so the research methodology and any future build work both benefit from the platform.

## What this repo is (today)

- A research workspace: literature, data analyses, synthesized findings, decision proposals
- A loom-aware consuming project: one project-local instance attached (`sde-extraction-dev`)
- A skill-bundled repo: the 16 methodology skills live locally in `skills/` + `skills_private/`

## What this repo may become (later)

- A web app with backend services
- A UI/UX surface for whatever the research output ends up being
- Additional loom instances when those surfaces materialize (e.g., `sde-extraction-app` for a deployed product, mirroring the Summer 2026 Hub two-instance pattern)

## Layout

```text
SDE_Extraction/
├── research/                        Primary work today
│   ├── literature/                  Lit reviews, papers, annotated bibliographies
│   ├── data/                        Datasets (gitignored if large; see research/data/README.md)
│   ├── notebooks/                   Analysis notebooks
│   └── findings/                    Synthesized findings + write-ups
│
├── apps/                            Future website/frontend (empty placeholder)
├── services/                        Future backend services (empty placeholder)
│
├── docs/
│   ├── proposals/                   Architectural / design decisions before code
│   ├── plans/                       Dated execution plans (YYYY-MM-DD-name.md)
│   ├── test-runs/                   Friction-surface logs from real work
│   ├── architecture/                Living architecture docs
│   └── decisions/                   ADRs (decision records)
│
├── scripts/                         Utility scripts
│
├── skills/                          9 public methodology skills (bundled)
├── skills_private/                  7 private methodology skills (bundled)
│
├── .project-intelligence/           Loom instance state (the-loom integration)
│   ├── instances.json
│   ├── README.md
│   └── sde-extraction-dev/          Current single instance
│
├── CLAUDE.md                        Project context auto-loaded by Claude Code
├── .env.template                    Copy to .env; gitignored
├── .gitignore
├── LICENSE                          Apache 2.0
└── README.md                        This file
```

## Discipline plugin (required)

```text
/plugin marketplace add Lizo-RoadTown/claude-skills-marketplace
/plugin install make-skills-discipline@lizo-skills
```

(Being renamed to `loom-discipline`; either name works during the transition.)

The plugin enforces PROBE-before-asserting, file:line citation, dev-tooling-vs-runtime distinction, friction-as-memory writes, skill-citation, and the layered-explanation pattern.

## Setup

1. **Clone and `cd` into the repo.**
2. **Install the discipline plugin** (above).
3. **Copy `.env.template` to `.env`** and fill in:
   - `LOOM_PROJECT_ID=sde-extraction-dev`
   - `OTEL_EXPORTER_OTLP_ENDPOINT` (copy from `the-loom/.env`)
   - `OTEL_EXPORTER_OTLP_HEADERS` (copy from `the-loom/.env`)
4. **Register with the-loom Project Registry**:
   ```powershell
   curl -X POST https://loom-project-registry.onrender.com/projects `
     -H "Content-Type: application/json" `
     -d '{\"slug\": \"sde-extraction-dev\", \"name\": \"SDE Extraction (Research)\", \"description\": \"Research-heavy project with future web/UI components\"}'
   ```
   (Self-host mode — no auth required today.)
5. **Open in Claude Code.** The discipline plugin loads. `memory_recall` will surface relevant prior context. Telemetry flows to Grafana tagged with `project_id=sde-extraction-dev`.

See [`docs/architecture/loom-wiring.md`](docs/architecture/loom-wiring.md) for the full integration map (created in this seed).

## Methodology skills (bundled in this repo)

The full set of methodology skills is in `skills/` and `skills_private/`. The most relevant for research-heavy work:

- `skills/deep-research-pattern` — research methodology (the primary playbook for heavy lit/data work)
- `skills/eval-deep-research` — evaluating research outputs
- `skills/document-parsing` — extracting structure from source documents
- `skills/documentation` — Diátaxis docs methodology (for writing findings)
- `skills/layered-explanation` — ELI5 → quick reference → depth → mental model
- `skills_private/proposal-authoring` — for writing decision proposals + ADRs
- `skills_private/lessons-learned` — friction-as-memory operational pattern
- `skills_private/agentic-upskilling` — the observe → promote → codify loop

Invoke skills by name in your responses (per the discipline plugin).

## License

Apache 2.0 — see [LICENSE](LICENSE).
