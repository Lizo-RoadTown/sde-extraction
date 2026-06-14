---
title: Run the extraction worker
description: Configure and run the background worker that processes extraction jobs.
---

The worker polls the job queue and runs the extractor. It lives in `services/extraction/`.

## 1. Configure

Copy `services/extraction/.env.example` to `.env` and fill in:

| Variable | Source |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `DATABASE_URL` | Supabase → Database → Connection string. Use a **port 5432** endpoint (direct if your network has IPv4 routing to it, else the **session pooler** — both are 5432). **Not** the **6543 transaction pooler**: it disables prepared statements, which the planned LangGraph checkpointer needs. The worker strips a `?pgbouncer=…` param automatically and prefers `DIRECT_URL` if set. |
| `SUPABASE_URL` | your project URL — **required for real runs** (see gotcha below) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role — **required for real runs** |

The worker also accepts repo-root aliases so credentials aren't duplicated: `DATABASE_URL`
falls back to `DB_URL` / `SUPABASE_POOLER_URL` / `DIRECT_URL`, and `SUPABASE_SERVICE_ROLE_KEY`
to `SUPABASE_DB_SERVICE_ROLE_KEY`.

:::caution[Silent stub gotcha]
If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the worker **cannot mint a signed
URL for the PDF**, so the processor falls back to a stub and records a `_dry_run` result —
**without erroring**. A job that "succeeds" but stored an empty/stub extraction almost always
means these two are unset (a common Render misconfiguration). Set both for real extractions.
:::

## 2. Run

```bash
cd services/extraction
pip install -r requirements.txt

python worker.py --once --dry-run    # exercise the loop, no OpenAI spend
python worker.py --once              # process queued jobs for real
python worker.py --daemon            # poll continuously (container default)
```

Or via Docker: `docker compose up` (reads `.env`, runs `--daemon`).

With no `DATABASE_URL` the worker idles gracefully rather than crashing.

*Source: `services/extraction/README.md`, `worker.py`.*
