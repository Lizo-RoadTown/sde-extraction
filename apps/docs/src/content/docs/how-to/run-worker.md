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
| `DATABASE_URL` | Supabase → Database → Connection string (use the **session pooler** URL, port 5432/6543 — the direct `db.<ref>` host is IPv6-only and fails on IPv4 networks) |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role |

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
