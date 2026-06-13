"""Supabase/Postgres wiring for the extraction worker.

Mirrors the proves backend pattern: a direct psycopg connection over DATABASE_URL,
an ATOMIC job claim (so two workers never grab the same job), and small helpers to
update job status and write the extraction result.

Graceful degradation: if DATABASE_URL is unset, db_configured() is False and the
worker idles instead of crashing (same spirit as the dashboard's mock mode).
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row


def get_db_url() -> Optional[str]:
    """Direct database URL. Prefer a non-pooler URL; strip the pgbouncer param
    (psycopg doesn't accept it), exactly as the proves worker did."""
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if url and "pgbouncer" in url:
        url = url.split("?")[0]
    return url


def db_configured() -> bool:
    return bool(get_db_url())


def connect() -> psycopg.Connection:
    url = get_db_url()
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg.connect(url, row_factory=dict_row)


# ---- job queue ---------------------------------------------------------------

def claim_next_job(conn: psycopg.Connection) -> Optional[dict[str, Any]]:
    """Atomically claim one queued job: flip the oldest queued row to 'extracting'
    and return it. SKIP LOCKED lets multiple workers run without colliding."""
    with conn.cursor() as cur:
        cur.execute(
            """
            update extraction_jobs
               set stage = 'extract', progress = 0.1, updated_at = now()
             where id = (
                 select id from extraction_jobs
                  where stage = 'queued' or stage = 'ingest'
                  order by created_at
                  for update skip locked
                  limit 1
             )
            returning id, paper_id, figure_label, target
            """
        )
        row = cur.fetchone()
        conn.commit()
        return row


def update_job(
    conn: psycopg.Connection,
    job_id: str,
    *,
    stage: Optional[str] = None,
    progress: Optional[float] = None,
    error: Optional[str] = None,
) -> None:
    sets, params = [], []
    if stage is not None:
        sets.append("stage = %s"); params.append(stage)
    if progress is not None:
        sets.append("progress = %s"); params.append(progress)
    if error is not None:
        sets.append("error = %s"); params.append(error)
    sets.append("updated_at = now()")
    params.append(job_id)
    with conn.cursor() as cur:
        cur.execute(f"update extraction_jobs set {', '.join(sets)} where id = %s", params)
        conn.commit()


def get_paper(conn: psycopg.Connection, paper_id: str) -> Optional[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            "select id, file_sha256, storage_path, title, pathogen, doi, page_count "
            "from papers where id = %s",
            (paper_id,),
        )
        return cur.fetchone()


def record_validation_event(
    conn: psycopg.Connection,
    *,
    point: str,
    subject_kind: str,
    outcome: str,
    job_id: Optional[str] = None,
    paper_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    latency_ms: Optional[int] = None,
    lineage_ref: Optional[str] = None,
    tags: Optional[dict[str, Any]] = None,
) -> None:
    """Append one validation_events row — the hook every pipeline stage fires (migration 0005).
    Best-effort: a telemetry write must never break the pipeline, so callers wrap it in try/except."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into validation_events
                (job_id, paper_id, thread_id, point, subject_kind, subject_id,
                 outcome, latency_ms, lineage_ref, tags)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (job_id, paper_id, thread_id, point, subject_kind, subject_id,
             outcome, latency_ms, lineage_ref, json.dumps(tags or {})),
        )
        conn.commit()


def write_extraction(
    conn: psycopg.Connection,
    *,
    paper_id: str,
    figure_label: str,
    model: dict[str, Any],
    pathogen: Optional[str],
    doi: Optional[str],
    file_sha256: Optional[str],
    status: str = "needs_human",
    lane: Optional[str] = None,
) -> str:
    """Insert the structured extraction (the present/absent VerifiedExtraction as
    JSONB) and return its id. Indexed facets mirror supabase/migrations/0001_init.sql.
    `lane` records which audience lane produced it (walkthrough / bulk) so the Bulk queue
    can filter Walkthrough-handled papers out (migration 0004)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into extractions
                (paper_id, figure_label, status, model, pathogen, doi, file_sha256, lane)
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            returning id
            """,
            (paper_id, figure_label, status, json.dumps(model), pathogen, doi, file_sha256, lane),
        )
        row = cur.fetchone()
        conn.commit()
        return str(row["id"])
