# Architecture

What this repo is + how it's wired. Generated alongside an automated
snapshot pipeline -- see [`docs/architecture-snapshots/`](docs/architecture-snapshots/)
for the latest deterministic state.

## Shape

Research-heavy `mixed` repo: combines a Python extraction service
(running as a Render docker worker), a Node dashboard, a docs site, and
deep research material in `research/`, `AT3_review/`, `Agent Drafts/`,
`Human validated/`.

Not a single application. The structure exists because the work spans
literature review + data extraction + an evolving dashboard. The product
shape will emerge as the research clarifies.

## Load-bearing directories

| Directory | What lives here |
|---|---|
| `research/` | Primary research surface -- literature, data, notebooks, findings |
| `AT3_review/` | Vendored prior HITL review system (read-only reference) |
| `Agent Drafts/` | LLM/agent output, not yet human-validated |
| `Human validated/` | Liz-reviewed artifacts. **Integrity boundary -- agents never write here.** |
| `services/extraction/` | Python extraction worker (Render-deployed) |
| `apps/dashboard/` | Vite/React dashboard |
| `apps/docs/` | Documentation site |
| `supabase/` | Supabase project state |
| `scripts/` | Repo automation (wrappers + spike scripts) |
| `docs/` | Project docs + architecture snapshots |
| `skills/`, `skills_private/` | Project-local skill drafts (canonical patterns live in `liz-patterns` plugin) |

The provenance discipline between `Agent Drafts/` and `Human validated/`
is documented in [`CLAUDE.md`](CLAUDE.md).

## Deployed services

One service today, on Render:

- **`sde-extraction-worker`** -- docker runtime, polls Supabase for new
  PDFs and runs OpenAI extraction. Env-var contract surfaced in the
  latest snapshot.

## Data layer

Supabase (project ref recorded in `.mcp.json` and in the worker env).
Schema lives under `supabase/`.

## MCP servers wired

Per `.mcp.json`:

- **`loom-memory`** -- cross-session memory at the operator's the-loom instance
- **`supabase`** -- direct Supabase access (database, docs, branching, functions, storage)

## Snapshots

`scripts/architecture_snapshot.py` and `scripts/architecture_diff.py` are
thin wrappers that dispatch to the canonical implementations in the
`liz-patterns` plugin
(`claude-skills-marketplace/plugins/liz-patterns/scripts/`). Per
`feedback_one_pattern_one_canonical_home_not_per_repo_copies_2026_06_13`.

Run from the repo root:

```bash
python scripts/architecture_snapshot.py
python scripts/architecture_diff.py
```

Outputs land in `docs/architecture-snapshots/<timestamp>-{snapshot,diff}.{json,md}`.

The loom-discipline plugin's SessionStart hook runs the snapshot
automatically when it detects the script + `ARCHITECTURE.md`. The diff
surfaces what changed since the last session -- it is the primary
mechanism for catching drift between Claude Code sessions on this repo.

## Memory + project-intelligence

This repo participates in the platform-level project-intelligence model:

- `.project-intelligence/` -- instance manifest + per-instance config
  (`sde-extraction-dev` today; `sde-extraction-app` planned when a
  product surface materializes)
- `LOOM_PROJECT_ID=sde-extraction` -- in `.env`, scopes loom-memory
  writes/reads to this project

See [`CLAUDE.md`](CLAUDE.md) for the full memory-discipline contract.
