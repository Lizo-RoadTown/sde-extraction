"""Dagster as a LAYER inside the extraction service — run ONE extraction through Dagster.

This is the "with Dagster" engine for the test branch. It runs the SAME real pipeline the worker
already uses (processor.run + the reproduction oracle), but as an in-process Dagster job, so the steps
are ordered, observable, and retriable. It is NOT a separate app or a deployed site: the worker imports
this and calls run_via_dagster() when EXTRACTION_ENGINE=dagster (the test branch); main leaves the env
unset and runs processor.run directly. Both write the SAME extraction — the only difference is the
orchestration, which is exactly what the PI is comparing.

dagster is imported only when this module is imported (the worker imports it lazily, in the dagster
branch), so the regular (main) path never needs dagster installed.
"""
import json
import time
from typing import Any, Optional

import dagster as dg

import processor
import transform as tr


class _ExtractCfg(dg.Config):
    pdf_url: Optional[str] = None
    figure_label: str = ""
    target_json: str = "{}"   # the job target as JSON (dagster config takes a plain string cleanly)
    no_llm: bool = False


@dg.op
def extract_op(context, config: _ExtractCfg) -> dict:
    """The extraction stage — the SAME OpenAI+Pydantic brain (processor.run), run as a Dagster op."""
    target = json.loads(config.target_json or "{}")
    out = processor.run(
        pdf_url=config.pdf_url, figure_label=config.figure_label, target=target, no_llm=config.no_llm,
    )
    m = out.get("model", {})
    context.log.info(
        f"[seam:extract] engine=dagster vars={len(m.get('variables') or [])} "
        f"params={len(m.get('parameters') or [])}",
    )
    return out


@dg.op
def reproduce_op(context, extraction: dict) -> dict:
    """The verify stage — run the reproduction oracle when an executable model exists, else honest not_run."""
    rec = tr.ReproductionRecord()
    model = (extraction or {}).get("model", {})
    if (model.get("drift_code") or "").strip():
        import oracle
        oracle.run_reproduction(rec.model, record=rec)
    else:
        rec.note = "no executable model assembled yet - verdict deferred"
        rec.decide()
    context.log.info(f"[seam:reproduce_check] engine=dagster status={rec.status}")
    return rec.model_dump()


@dg.job
def extraction_job():
    """detect+extract (the LLM brain) -> verify, run as an observable Dagster job."""
    reproduce_op(extract_op())


def _capture_run(result, duration_ms: int) -> dict[str, Any]:
    """Capture the COMPLETE Dagster run — every event, per-step rollup, run id, status, timing — so our
    OWN observability surface can render the orchestration. Observability is the whole point: if a run
    isn't captured, it never happened as far as the site is concerned. Defensive: capture must never
    break the extraction itself."""
    rec: dict[str, Any] = {"run_id": None, "success": None, "duration_ms": duration_ms,
                           "steps": {}, "events": []}
    try:
        rec["run_id"] = str(result.run_id)
        rec["success"] = bool(result.success)
        for e in result.all_events:
            etype = getattr(e, "event_type_value", None) or str(getattr(e, "event_type", ""))
            step = getattr(e, "step_key", None)
            msg = getattr(e, "message", None)
            ev: dict[str, Any] = {"type": etype, "step": step}
            if msg:
                ev["message"] = str(msg)[:400]
            rec["events"].append(ev)
            if step:
                s = rec["steps"].setdefault(step, {"op": step, "events": [], "status": "running"})
                s["events"].append(etype)
                if etype == "STEP_SUCCESS":
                    s["status"] = "success"
                elif etype in ("STEP_FAILURE", "STEP_UP_FOR_RETRY"):
                    s["status"] = "failed" if etype == "STEP_FAILURE" else "retrying"
                elif etype == "STEP_SKIPPED":
                    s["status"] = "skipped"
        rec["event_count"] = len(rec["events"])
    except Exception as e:  # noqa: BLE001 — never let capture break the run
        rec["capture_error"] = f"{type(e).__name__}: {e}"
    return rec


def run_via_dagster(
    *, pdf_url: Optional[str], figure_label: str, target: dict[str, Any], no_llm: bool = False,
) -> dict[str, Any]:
    """Run ONE extraction through Dagster in-process. Returns processor.run's shape (model + checksums
    + locations + figure_provenance) PLUS the reproduction record, engine marker, and a COMPLETE
    captured run record ('orchestration') so our own site can show the full orchestration."""
    t0 = time.monotonic()
    result = extraction_job.execute_in_process(
        run_config={"ops": {"extract_op": {"config": {
            "pdf_url": pdf_url, "figure_label": figure_label,
            "target_json": json.dumps(target or {}), "no_llm": no_llm,
        }}}},
        raise_on_error=False,  # capture failures instead of throwing, so a failed run is still recorded
    )
    duration_ms = int((time.monotonic() - t0) * 1000)
    out = dict(result.output_for_node("extract_op")) if result.success else {"model": {}}
    out["reproduction"] = result.output_for_node("reproduce_op") if result.success else {}
    out["engine"] = "dagster"
    out["orchestration"] = _capture_run(result, duration_ms)
    return out
