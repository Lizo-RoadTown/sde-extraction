"""Validation-event hooks — every pipeline stage fires one (the telemetry spine).

A hook records {point, subject, outcome, latency, lineage, tags} into validation_events
(migration 0005). Best-effort BY DESIGN: a telemetry write must never break extraction, so
emit() swallows its own errors. Used by the worker today and by the v2 LangGraph nodes later.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Iterator, Optional

import db


def emit(
    conn: Any,
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
    """Fire one validation-event hook. Never raises — telemetry can't break the pipeline."""
    try:
        db.record_validation_event(
            conn, point=point, subject_kind=subject_kind, outcome=outcome,
            job_id=job_id, paper_id=paper_id, thread_id=thread_id, subject_id=subject_id,
            latency_ms=latency_ms, lineage_ref=lineage_ref, tags=tags,
        )
    except Exception as e:  # noqa: BLE001 — best-effort telemetry
        print(f"  hook({point}) failed: {e}")


class _Stage:
    def __init__(self, tags: dict[str, Any]) -> None:
        self.tags = tags
        self.outcome = "pass"
        self.lineage_ref: Optional[str] = None


@contextmanager
def stage(
    conn: Any,
    *,
    point: str,
    subject_kind: str,
    job_id: Optional[str] = None,
    paper_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    tags: Optional[dict[str, Any]] = None,
) -> Iterator[_Stage]:
    """Time a stage and emit a hook around it (fail on exception, else the stage's outcome).

        with stage(conn, point="locate", subject_kind="script", job_id=jid) as h:
            ...do work...; h.tags["located"] = n   # h.outcome defaults to "pass"
    """
    started = time.monotonic()
    h = _Stage(dict(tags or {}))
    try:
        yield h
    except Exception:
        emit(conn, point=point, subject_kind=subject_kind, outcome="fail",
             job_id=job_id, paper_id=paper_id, thread_id=thread_id, subject_id=subject_id,
             latency_ms=int((time.monotonic() - started) * 1000), tags=h.tags)
        raise
    emit(conn, point=point, subject_kind=subject_kind, outcome=h.outcome,
         job_id=job_id, paper_id=paper_id, thread_id=thread_id, subject_id=subject_id,
         latency_ms=int((time.monotonic() - started) * 1000), lineage_ref=h.lineage_ref, tags=h.tags)
