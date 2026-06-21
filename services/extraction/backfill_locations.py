"""Backfill on-page positions for already-stored extractions — deterministic, NO LLM.

The locator runs at extraction time, so extractions created before the locator fix carry no rects
(located:false everywhere). This re-runs the SAME deterministic locator (locator.annotate_locations)
over each stored extraction's model against its source PDF and writes the recovered positions back.
No OpenAI call, no re-extraction — just position recovery. Idempotent (re-locating is harmless).

Which schema it operates on follows APP_SCHEMA (db.connect sets the search_path):
  python backfill_locations.py                      # public (the direct path's data)
  APP_SCHEMA=dagster_app python backfill_locations.py   # the Dagster path's data

Flags:
  --limit N   cap the number of extractions scanned
  --dry       report what WOULD change, write nothing
"""

from __future__ import annotations

import argparse
import json
import os

import db
import locator
from processor import _download
from worker import _signed_pdf_url  # importing worker also loads the repo-root .env (harmless)


def _public_url(storage_path: str | None) -> str | None:
    base = os.environ.get("SUPABASE_URL")
    if not (base and storage_path):
        return None
    return f"{base}/storage/v1/object/public/papers/{storage_path}"


def _pdf_url(paper: dict) -> str | None:
    """Prefer a signed URL (works for private buckets); fall back to the public object URL."""
    return _signed_pdf_url(paper, dry_run=False) or _public_url(paper.get("storage_path"))


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill locator positions for stored extractions (no LLM)")
    ap.add_argument("--limit", type=int, default=None, help="max extractions to scan")
    ap.add_argument("--dry", action="store_true", help="report only; do not write")
    args = ap.parse_args()

    if not db.db_configured():
        print("no DATABASE_URL — nothing to do.")
        return

    schema = os.environ.get("APP_SCHEMA", "public") or "public"
    print(f"backfill: schema={schema} dry={args.dry}")

    scanned = updated = total_located = total_missing = 0
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select e.id, e.model, p.storage_path
                  from extractions e
                  join papers p on p.id = e.paper_id
                 where e.model ? 'variables'
                 order by e.created_at desc
                """
            )
            rows = cur.fetchall()

        for row in rows:
            if args.limit is not None and scanned >= args.limit:
                break
            scanned += 1
            ext_id = str(row["id"])
            model = row["model"]
            url = _pdf_url({"storage_path": row.get("storage_path")})
            if not url:
                print(f"  {ext_id}: no PDF url — skip")
                continue
            try:
                path = _download(url)
            except Exception as e:  # noqa: BLE001
                print(f"  {ext_id}: download failed ({e}) — skip")
                continue
            try:
                model, stats = locator.annotate_locations(path, model)
            finally:
                try:
                    os.remove(path)
                except OSError:
                    pass
            total_located += stats["located"]
            total_missing += stats["missing"]
            print(f"  {ext_id}: located={stats['located']} missing={stats['missing']}")
            if stats["located"] > 0 and not args.dry:
                with conn.cursor() as cur:
                    cur.execute("update extractions set model = %s where id = %s", (json.dumps(model), ext_id))
                    conn.commit()
                updated += 1

    verb = "would update" if args.dry else "updated"
    print(f"done: scanned {scanned}, {verb} {updated} "
          f"(located {total_located}, still missing {total_missing})")


if __name__ == "__main__":
    main()
