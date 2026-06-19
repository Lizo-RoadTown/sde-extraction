# orchestration — a test workflow stack (Dagster) over the existing pipeline

A thin Dagster **layer** that runs the SAME real functions the worker uses
(`../extraction`: `figures`, `processor`, `oracle`), so the existing pipeline's stages become explicit,
ordered, observable steps you can run **locally on this test branch**. It is a test of whether making
the deterministic moments concrete (and confining the LLM to one node) is worth it.

**It is NOT a separate app or engine, it is NOT deployed, and it has no separate database.** It shares
the existing pipeline's code and runs locally. (An earlier version of this was wrongly built as a
standalone deployed site; that was removed.)

## Stages (mirroring the real pipeline)

| Node | Kind | What it does |
|---|---|---|
| `detect_figures` | deterministic | real `figures.detect_serializable` + isolate the human's picked panel; dual SHA-256 provenance |
| `extract` | the ONE LLM node | real `processor.run` — dry-run by default (`no_llm`, no OpenAI spend); set `no_llm=false` + a key for a real call |
| `reproduce` | deterministic | real `oracle.run_reproduction` when an executable model exists; otherwise honest `not_run` (the extractor doesn't assemble an executable model yet) |

Every node emits one `[seam:<name>]` log line — the observability seam.

## Run it (locally — no deploy, no spend)

```bash
cd services/orchestration
uv sync
uv run dg check defs
uv run dg launch --assets reproduction_record \
  --config '{"ops":{"reproduction_record":{"ops":{"detect_figures":{"config":{"pdf_path":"/path/to/paper.pdf","no_llm":true}}}}}}'
uv run dg dev   # optional local lineage UI at localhost:3000
```

Local runs use Dagster's default ephemeral instance — no Supabase, no Postgres, nothing to deploy.

## Planned next layer (not faked here)

1. The extractor assembles an `ExecutableModel` (drift/diffusion code) so `reproduce` yields a real
   verdict via the oracle.
2. A per-variable classifier fan-out (the `VariableClassification`/`match_role` registry gate).

These are future nodes; today the workflow mirrors what the real pipeline actually does.
