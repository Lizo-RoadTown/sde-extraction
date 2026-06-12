# Extraction worker — design

*Approved by Liz 2026-06-12. Runtime (`services/extraction/`). Mirrors the proves
backend WIRING (Docker + Supabase poll-worker) with SDE_Extraction's own OpenAI +
Pydantic present/absent brain. Deploys as a portable Docker container (runs anywhere;
Render background worker is the chosen host).*

## Goal

Make the system "ready to ingest and run": the dashboard queues an extraction job, a
background worker picks it up, runs the OpenAI+Pydantic extractor on the PDF, writes the
present/absent result with lineage, and marks it for human verification — end to end.

## Pattern (mirrored from proves, verified via Explore of PROVES_SANDBOX)

proves runs two processes sharing one Supabase Postgres: a thin API that *queues* jobs,
and a worker daemon that *polls* the queue and runs the agent. We mirror the **worker +
DB + Docker wiring**, not the agent internals:

| proves | SDE_Extraction |
|---|---|
| Anthropic + LangGraph (FRAMES ontology) | **OpenAI + Pydantic** (present/absent canon — keep) |
| `urls_to_process` queue, web crawl input | **`extraction_jobs`** queue, **PDF** input |
| `worker.py --daemon` polls every 30s, psycopg to `DATABASE_URL` | **same shape** |
| agent writes `staging_extractions` | writes **`extractions`** (our `VerifiedExtraction` JSONB) |

## Components (new, in `services/extraction/`)

- **`db.py`** — psycopg connection to Supabase via `DATABASE_URL` (mirrors proves'
  `get_db_connection`, strips pgbouncer param). Helpers: `claim_next_job()` (atomic
  `UPDATE … SET status='extracting' … RETURNING` so two workers never grab the same job),
  `write_extraction()`, `update_job(stage, progress, status, error)`.
- **`processor.py`** — wraps the existing `extract_sample.py` logic as the job processor:
  download the paper PDF (Supabase storage signed URL from `storage_path`), build the
  prompt **honoring the job's targeting mode** (`auto` / `figure` / `model` / `whole`),
  call OpenAI Structured Outputs → `FigureExtraction`, attach checksums (`checksums_for`),
  return the `VerifiedExtraction`-shaped dict.
- **`worker.py`** — the daemon loop, proves-shaped:
  `--daemon` (poll every N s) / `--once` (drain then exit) / `--dry-run` (no OpenAI call —
  exercise the loop + DB without spend). Per job: `claim → update_job(extracting) →
  processor.run → write_extraction(status=needs_human) → update_job(stored)`, errors →
  `update_job(failed, error=…)`.
- **`Dockerfile`** — `python:3.12-slim`, install `requirements.txt`, `CMD ["python",
  "worker.py", "--daemon"]`.
- **`docker-compose.yml`** — the worker service, `env_file: .env`, `restart: unless-stopped`.
- **`render.yaml`** — a Render **background worker** (`type: worker`) built from the
  Dockerfile; env vars referenced (not committed). *(Also makes the deploy infra-as-code —
  currently nothing in the repo records how anything deploys.)*
- **`.env.example`** — `DATABASE_URL`, `OPENAI_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `POLL_INTERVAL`, `OPENAI_MODEL`.
- **`requirements.txt`** — `openai`, `pydantic`, `psycopg[binary]`, `python-dotenv`,
  `pypdf` (for page handling). **No LangChain** — not used.

## Dashboard wire

Intake's "Extract" button currently sets local state only. Add: on click, insert an
`extraction_jobs` row (`paper_id`, `figure_label` or the targeting payload, `status=queued`)
via the existing Supabase client in `data.ts`. The worker picks it up; Process/Verify
already read these tables. (Mock mode: no Supabase → button stays a local no-op, as today.)

## Job targeting payload

The job row carries the user's targeting choice (the Intake modes):
`{ mode: "auto"|"figure"|"model"|"whole", figure_ref?: string, model_desc?: string }`,
stored in a `target` JSONB column (add via a small migration `0002`). `processor.py`
branches on `mode` to build the prompt.

## Data flow

```
Intake "Extract" ──insert──▶ extraction_jobs (status=queued, target={mode,…})
                                   │  worker.claim_next_job() (atomic)
                                   ▼
                   update_job(stage=extract, status=extracting)
                   processor: signed PDF URL → OpenAI(target-aware) → FigureExtraction → checksums
                                   │
                                   ▼
                   write_extraction(extractions row, status=needs_human)  +  update_job(stored)
                                   │
                                   ▼
                   Verify surface shows it (already wired to load needs_human rows)
```

## Honest seams

- Runs end-to-end **only** with real `DATABASE_URL` + `OPENAI_API_KEY`. Without them the
  worker logs "no DB configured" and idles (graceful, like the dashboard's mock mode).
- `--dry-run` exercises poll → claim → write with a stub extraction, so the loop is
  testable without OpenAI spend.
- PDF→math fidelity is whatever OpenAI's file input gives us now; the Marker/Mathpix
  pre-step from the prior-art pipeline is a later upgrade, not in this slice.
- Confidence/tagging compute is NOT here — the worker writes extractions; scoring is the
  confidence pillar's own build.

## Build order

1. `0002` migration: add `target` JSONB to `extraction_jobs`.
2. `db.py` → `processor.py` → `worker.py`.
3. `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `render.yaml`.
4. Dashboard: Intake Extract → insert job row.
5. Verify: `python worker.py --once --dry-run` against a local/test DB; `docker build`.
   Commit + push (Render builds the worker).

## Out of scope (now)

- Marker/Mathpix PDF→LaTeX pre-stage.
- Confidence scoring + the self-update apply path.
- Multi-worker scaling beyond the atomic-claim guard.
