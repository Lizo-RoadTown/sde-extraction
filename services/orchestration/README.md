# orchestration — the deterministic extraction backbone (Dagster)

A dynamic-task-mapping DAG that runs every **deterministic** moment of extraction as an observable,
retriable node, and confines **autonomous** behavior to a few subagent nodes. The point is *true
reproducibility*: the whole run is a recorded, replayable, audited graph.

This is a **skeleton** — it proves the shape end to end. It is not deployed and does not yet do real
science.

## What is real vs a placeholder (skeleton)

| Node | Stage | Status |
|---|---|---|
| `detect_figures` | figure-detect | **real** — runs `figures.detect_serializable` + isolates the human's picked panel (`isolate_region`/`isolate_figure`), records dual SHA-256 provenance. Takes a `ChosenFigure` run config (`pdf_path` + the pick) |
| `read_model` | figure-read | **placeholder** — real impl = a vision-LLM subagent (autonomous) |
| `fan_out_variables` | per-variable fan-out | **real** — Dagster dynamic mapping (`DynamicOut` / `.map` / `.collect`) |
| `extract_variable` (mapped) | per-variable lift | lift content **placeholder** (subagent not wired); the **Pydantic classifier layer is real** — `VariableClassification` validated, role gated against the registry via `match_role` |
| `reconcile` | reconcile | **real** — collects per-variable `TermTransform`s into a `ReproductionRecord` |
| `reproduce` | verify (re-sim) | **real** — calls `oracle.run_reproduction` (the BioModels diffrax harness, fixed seed, run twice → hash-compare) when a runnable `ExecutableModel` exists; with the placeholder lift no model is assembled, so the verdict is honestly `not_run`. Oracle itself tested in `tests/test_oracle.py` |

The reproducibility core imports the real machinery from `../extraction` (`schema`, `classification`,
`transform`) — pydantic-only modules, added to `sys.path` in `defs/pipeline.py`.

Every node emits one `[seam:<name>]` log line — the observability seam (a validation_event). Per-node
lineage + retriability is exactly why Dagster was chosen.

## Run it

```bash
cd services/orchestration
uv sync
uv run dg check defs                            # validate
uv run dg launch --assets reproduction_record   # materialize end to end
uv run dg dev                                   # lineage UI at localhost:3000
```

## Deploy (Render)

Dagster's open-source core (Apache 2.0) is self-hosted as a **new** Render web service alongside the
worker (no Dagster+ required). Deploy-as-code lives in `Dockerfile`, `workspace.yaml`, `dagster.yaml`,
and the `sde-orchestration-web` service in the repo-root `render.yaml`. Validated locally: image builds,
container boots, loads `orchestration.definitions`, serves `/server_info` 200.

**Storage reuses the existing Supabase Postgres — isolated to its own `dagster` schema** (validated safe;
shared `public` was not). Before first deploy, run once in Supabase:

```sql
CREATE SCHEMA IF NOT EXISTS dagster;
```

Then set the five `DAGSTER_PG_*` secrets (from the Supabase **Session pooler**, port 5432) on the Render
service. `search_path=dagster` is pinned in `dagster.yaml`, so Dagster's ~22 tables never touch `public`
and Supabase won't auto-expose them. Smoke-test the first boot: confirm the tables landed in `dagster.*`.

## Fill-out order

1. ~~`detect_figures` -> real `figures.detect_serializable` + the human's panel pick.~~ **done.**
2. ~~`reproduce` -> run the BioModels diffrax harness (fixed seed) twice; two-part verdict.~~ **done** (`oracle.py`).
3. `read_model` + `extract_variable` -> the real subagents (OpenAI + Pydantic brain), still gated by the
   classifier layer. They must assemble the `ExecutableModel` (drift/diffusion code) the oracle runs.
   **next.**
4. Persist the `ReproductionRecord` to Supabase; surface per-subagent health by variable/parameter type.
