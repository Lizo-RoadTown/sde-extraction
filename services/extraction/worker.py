"""Extraction worker — the daemon that makes the system "ingest and run".

Mirrors the proves worker shape: poll the Supabase `extraction_jobs` queue, claim a
job atomically, run the OpenAI+Pydantic extractor (processor.py) on the paper PDF,
write the present/absent result to `extractions`, and mark the job stored. Errors mark
the job failed with the message.

Run:
  python worker.py --daemon                 # poll forever (the container default)
  python worker.py --once                   # drain queued jobs, then exit
  python worker.py --once --dry-run         # exercise the loop with NO OpenAI call

Graceful: with no DATABASE_URL the worker logs and idles instead of crashing.
"""

from __future__ import annotations

import argparse
import os
import time

# Load a .env into the environment for direct `python worker.py` runs (Docker uses
# env_file instead). Checks this dir first, then the repo root, so the worker can
# reuse the project-root .env. Must run BEFORE importing db (which reads os.environ).
try:
    from dotenv import load_dotenv
    _here = os.path.dirname(os.path.abspath(__file__))
    for _p in (os.path.join(_here, ".env"), os.path.join(_here, "..", "..", ".env")):
        if os.path.exists(_p):
            load_dotenv(_p, override=False)
            break
except ImportError:
    pass

# Accept the repo-root .env's variable names as aliases for the worker's names,
# so credentials don't have to be duplicated under different keys.
_ALIASES = {
    # Prefer the IPv4-reachable pooler URL over the IPv6-only direct host.
    "DATABASE_URL": ("DB_URL", "SUPABASE_POOLER_URL", "SUPABASE_DB_URL", "DIRECT_URL"),
    "SUPABASE_SERVICE_ROLE_KEY": ("SUPABASE_DB_SERVICE_ROLE_KEY",),
}
for _canonical, _alts in _ALIASES.items():
    if not os.environ.get(_canonical):
        for _alt in _alts:
            if os.environ.get(_alt):
                os.environ[_canonical] = os.environ[_alt]
                break

import db
import processor

POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "30"))


def _signed_pdf_url(paper: dict, dry_run: bool) -> str | None:
    """Best-effort PDF URL for the processor. In dry-run we don't need one. With
    Supabase storage configured, mint a signed URL from storage_path; else None
    (processor falls back to a stub for that job and we record it absent)."""
    if dry_run:
        return None
    storage_path = paper.get("storage_path")
    if not storage_path:
        return None
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        return None
    try:
        from supabase import create_client
        client = create_client(url, key)
        signed = client.storage.from_("papers").create_signed_url(storage_path, 3600)
        return signed.get("signedURL") or signed.get("signedUrl")
    except Exception as e:  # noqa: BLE001 — never let URL minting kill the job loop
        print(f"  signed-url failed ({e}); proceeding without PDF")
        return None


def process_one(conn, job: dict, *, dry_run: bool) -> None:
    job_id = str(job["id"])
    figure_label = job.get("figure_label") or ""
    target = job.get("target") or {"mode": "auto"}
    print(f"job {job_id}: extracting (figure={figure_label!r}, mode={target.get('mode')})")
    try:
        paper = db.get_paper(conn, str(job["paper_id"])) or {}
        db.update_job(conn, job_id, stage="extract", progress=0.4)
        pdf_url = _signed_pdf_url(paper, dry_run)

        result = processor.run(
            pdf_url=pdf_url, figure_label=figure_label, target=target, no_llm=dry_run,
        )

        db.update_job(conn, job_id, stage="machine_verify", progress=0.8)
        ext_id = db.write_extraction(
            conn,
            paper_id=str(job["paper_id"]),
            figure_label=figure_label,
            model={**result["model"], "_checksums": result["checksums"]},
            pathogen=paper.get("pathogen"),
            doi=paper.get("doi"),
            file_sha256=paper.get("file_sha256"),
            status="needs_human",
        )
        db.update_job(conn, job_id, stage="stored", progress=1.0)
        print(f"job {job_id}: stored extraction {ext_id} (needs_human)")
    except Exception as e:  # noqa: BLE001 — one bad job shouldn't stop the worker
        print(f"job {job_id}: FAILED — {e}")
        db.update_job(conn, job_id, stage="failed", error=str(e))


def drain(*, dry_run: bool, limit: int | None = None) -> int:
    """Claim and process queued jobs until the queue is empty (or limit hit)."""
    if not db.db_configured():
        print("no DATABASE_URL — nothing to do (idle).")
        return 0
    processed = 0
    with db.connect() as conn:
        while True:
            if limit is not None and processed >= limit:
                break
            job = db.claim_next_job(conn)
            if not job:
                break
            process_one(conn, job, dry_run=dry_run)
            processed += 1
    return processed


def run_daemon(*, dry_run: bool) -> None:
    print(f"worker: daemon mode, polling every {POLL_INTERVAL}s "
          f"(db={'configured' if db.db_configured() else 'NOT configured — idling'})")
    while True:
        try:
            n = drain(dry_run=dry_run)
            if n:
                print(f"  processed {n} job(s)")
        except Exception as e:  # noqa: BLE001 — keep the daemon alive across blips
            print(f"  poll error: {e}")
        time.sleep(POLL_INTERVAL)


def main() -> None:
    ap = argparse.ArgumentParser(description="SDE extraction worker")
    ap.add_argument("--daemon", action="store_true", help="poll the queue forever")
    ap.add_argument("--once", action="store_true", help="drain queued jobs then exit")
    ap.add_argument("--dry-run", action="store_true", help="no OpenAI call (stub extraction)")
    ap.add_argument("--limit", type=int, default=None, help="max jobs in --once mode")
    args = ap.parse_args()

    if args.daemon:
        run_daemon(dry_run=args.dry_run)
    else:  # --once is the default if neither given
        n = drain(dry_run=args.dry_run, limit=args.limit)
        print(f"done: processed {n} job(s)")


if __name__ == "__main__":
    main()
