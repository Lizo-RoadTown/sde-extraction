# SDE_Extraction Loom Wiring

**Status:** 2026-05-31 — seeded structure complete; registration + adapter implementations pending.

How this repo plugs into the platform per the three-layer architecture (see [the-loom architecture doc](https://github.com/Lizo-RoadTown/the-loom/blob/main/docs/architecture/2026-05-31-five-module-platform.md) § Module 4).

## The three layers, mapped to this repo

```text
LAYER 1: REUSABLE CORE ENGINE
└── Lives in: Lizo-RoadTown/Make_Skills/
    Agency-to-Structure Engine, recursive skill loop, per-turn agent loop,
    local pattern detection, candidate generation, compilation pipeline.

LAYER 2: PROJECT-TYPE ADAPTERS
└── Lives in: Make_Skills/adapters/<type>/ (pending implementation)
    - research-project/    primary adapter for SDE_Extraction during heavy-research phase
    - development/         secondary adapter when work moves into apps/ + services/

LAYER 3: PROJECT-LOCAL INSTANCE (this repo)
└── .project-intelligence/sde-extraction-dev/
    Researcher + developer-facing. Single instance for now;
    -app instance to be added when web/UI lands.
```

This repo does NOT contain a copy of the core engine. The engine is instantiated per-instance via the adapter; this instance reads its config from `.project-intelligence/sde-extraction-dev/` and its memory + telemetry from the-loom.

## Data flow — a typical session

```text
1. Liz opens this repo in Claude Code
       │
       ▼
2. Discipline plugin (loom-discipline) loads at SessionStart:
       │
       ├─ Reads .env → LOOM_PROJECT_ID=sde-extraction-dev
       ├─ Calls memory_recall(project_tags=["sde-extraction-dev"]) (when v0.1.7 lands)
       └─ Initializes hook scripts
       │
       ▼
3. Liz prompts the agent (e.g., "summarize the three papers I added today").
   Each hook event:
       │
       ├─ Logs to ${CLAUDE_PROJECT_DIR}/.claude/logs/hooks.jsonl
       └─ POSTs to ${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs
          tagged with project_id=sde-extraction-dev
       │
       ▼
4. Agent applies relevant skills: deep-research-pattern, document-parsing,
   layered-explanation. Writes synthesis to research/findings/.
       │
       ▼
5. Friction-as-memory: when Liz corrects the agent, the agent calls
   memory_write(record_type="feedback", project_tags=["sde-extraction-dev"]).
       │
       ▼
6. Cross-session: next time Liz opens this repo, memory_recall surfaces
   the relevant feedback + research findings from prior sessions.
```

## Promotion paths

Both paths converge at the-loom's Policy + Architecture Registry.

### Path A — Local candidate (most common for a single research project)

```text
sde-extraction-dev instance detects 3+ "synthesize N findings into a write-up"
or 3+ "annotate this paper with claims + methods + limitations" requests
       │
       ▼
Local skill candidate written to
.project-intelligence/sde-extraction-dev/promotion-candidates/
       │
       ▼
Make_Skills core submits candidate to the-loom Architecture Registry
       │
       ▼
the-loom Policy Service ratifies (or rejects)
       │
       ▼
Ratified: skill compiled, registered in catalog, available to future projects
```

### Path B — Platform observatory (cross-project pattern)

If the SAME shape recurs across multiple research projects (this one + future), the-loom's Project Observatory may surface it as a platform-side candidate independently.

## What's wired today (2026-05-31)

| Piece | Status |
|---|---|
| `.project-intelligence/sde-extraction-dev/` + all configs | ✅ Seeded |
| `skills/` and `skills_private/` (16 methodology skills bundled) | ✅ Bundled |
| `CLAUDE.md` + `.env.template` | ✅ Created |
| `research/`, `apps/`, `services/`, `docs/` skeleton | ✅ Scaffolded |
| Git initialized + GitHub remote (`sde-extraction.git`, private) | ✅ Created |
| `sde-extraction-dev` registered in the-loom Project Registry | ❌ Pending — `curl POST https://loom-project-registry.onrender.com/projects` |
| `research-project` adapter implemented in Make_Skills | ❌ Pending — `Make_Skills/adapters/research-project/` doesn't exist yet |
| `development` adapter implemented in Make_Skills | ❌ Pending |
| `.env` filled in (LOOM_PROJECT_ID + OTel creds) | ❌ Pending — Liz copies from the-loom's `.env` |
| Discipline plugin installed on this machine | Assumed (already installed for Hub, Make_Skills, etc.) |

## Next steps for whoever picks this up

1. Run the registration curl (or wait for the scaffolder's improvements PR to land + use it)
2. Copy `.env.template` → `.env`, fill in OTel creds from `the-loom/.env`
3. Open in Claude Code; confirm telemetry flows tagged with `project_id=sde-extraction-dev` (visible on Grafana with that filter)
4. Begin research — `research/literature/` and `research/notebooks/` are ready

When the website/UI materializes:

1. Build under `apps/` + `services/`
2. Add `.project-intelligence/sde-extraction-app/` with its own configs
3. Update `.project-intelligence/instances.json` to list both instances
4. Update `CLAUDE.md` with the two-instance boundary rule (mirror the Hub's pattern)
5. Register `sde-extraction-app` with Project Registry
