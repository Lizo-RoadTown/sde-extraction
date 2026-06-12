# Extraction worker — run it

The worker polls the Supabase `extraction_jobs` queue, runs the OpenAI + Pydantic
present/absent extractor on each paper PDF, and writes the result to `extractions`
(status `needs_human`) for the dashboard's **Verify** surface to inspect.

The OpenAI side is already wired to the canon schema: `processor.py` calls
`client.responses.parse(..., text_format=FigureExtraction)` where `FigureExtraction`
is the present/absent model in `schema.py` (the single source of truth shared with the
dashboard). Nothing to build on the model side — it needs credentials and a run.

## 1. Database + storage (already done)

Applied to project `sohimlkvueagelulsrgi`:
- `0001_init` (papers, extraction_jobs, extractions, review_*), `0002_job_target`.
- `papers` storage bucket (public).

## 2. Credentials

Copy `.env.example` → `.env` and fill in:

| Var | Where to get it |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `DATABASE_URL` | Supabase → Settings → Database → **Connection string → URI** (port **5432**, the *direct* one, not the 6543 pooler). Strip any `?pgbouncer=...`. |
| `SUPABASE_URL` | `https://sohimlkvueagelulsrgi.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secret) |

The dashboard separately needs `apps/dashboard/.env.local` with `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` so upload + enqueue hit real Supabase instead of mock mode.

## 3. Run

```bash
cd services/extraction
pip install -r requirements.txt          # first time

python worker.py --once --dry-run        # exercise the loop, NO OpenAI spend
python worker.py --once                  # process queued jobs for real (one drain)
python worker.py --daemon                # poll forever (the container default)
```

Or via Docker (matches how it deploys):

```bash
docker compose up                        # reads .env, runs --daemon
```

## 4. First real end-to-end test

1. Dashboard (with `.env.local` set): **Intake** → upload a real paper PDF → pick a
   targeting mode → **Extract** (this inserts an `extraction_jobs` row).
2. `python worker.py --once` — watch it claim the job, call OpenAI, write the extraction.
3. Dashboard → **Verify** — the extraction appears; inspect each slot's present/absent
   against the PDF, confirm or correct.

That round trip proves the whole spine: PDF → Pydantic-constrained OpenAI → DB → Verify.

## Deploy (Render background worker)

`render.yaml` at the repo root declares this as a Render worker (`type: worker`,
`runtime: docker`). Create the Blueprint in Render, set the four secrets above in the
dashboard (they're marked `sync: false`), and it runs continuously.

## Honest status

- Wiring + Docker build + dry-run: **verified**.
- A real extraction against a live paper: **not yet run** (needs `OPENAI_API_KEY`). The
  first `--once` run is the proof, and the Verify human-check is the backstop for
  whatever the model gets wrong.
- PDF→math is whatever OpenAI's file input gives us; a Marker/Mathpix pre-stage is a
  later upgrade.
