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
import hooks
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


def _detect_figures(conn, job_id: str, paper_id: str, paper: dict, intake: dict, *, dry_run: bool) -> None:
    """Detect job (target.mode == 'detect'): run the SAME server-side PyMuPDF detector used for
    extraction and store the regions for the human chooser. No extraction, no ranking — the human
    picks from these and the pick drives a normal figure-mode extraction."""
    import figures as F
    from processor import _download

    db.update_job(conn, job_id, stage="extract", progress=0.4)
    figs: list = []
    pdf_url = _signed_pdf_url(paper, dry_run)
    if pdf_url:
        path = _download(pdf_url)
        try:
            figs = F.detect_serializable(path)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass
    db.set_detected_figures(conn, paper_id, figs)
    db.update_job(conn, job_id, stage="stored", progress=1.0)
    hooks.emit(conn, point="detect", subject_kind="script",
               outcome="pass" if figs else "flag",
               job_id=job_id, paper_id=paper_id, thread_id=job_id,
               subject_id="figures:pymupdf", tags={**intake, "n_figures": len(figs)})
    print(f"job {job_id}: detected {len(figs)} figure(s) for paper {paper_id}")


def process_one(conn, job: dict, *, dry_run: bool) -> None:
    job_id = str(job["id"])
    figure_label = job.get("figure_label") or ""
    target = job.get("target") or {"mode": "auto"}
    # Engine: which pipeline runs this job. "direct" = processor.run (main, as we have it);
    # "dagster" = the SAME pipeline run through Dagster (the test branch sets EXTRACTION_ENGINE=dagster).
    # Identical app, identical result — only the orchestration differs. That is the PI's comparison.
    engine = (target or {}).get("engine") or os.environ.get("EXTRACTION_ENGINE", "direct")
    # The intake path — stamped on every seam hook so observability decomposes by WHERE the
    # data came in (lane) and HOW it was targeted (mode) and its origin (source) and which engine ran it.
    intake = {"lane": target.get("lane"), "mode": target.get("mode"),
              "source": target.get("source") or "upload", "engine": engine}
    print(f"job {job_id}: extracting (figure={figure_label!r}, mode={target.get('mode')}, engine={engine})")
    try:
        paper = db.get_paper(conn, str(job["paper_id"])) or {}
        if (target or {}).get("mode") == "detect":
            _detect_figures(conn, job_id, str(job["paper_id"]), paper, intake, dry_run=dry_run)
            return
        db.update_job(conn, job_id, stage="extract", progress=0.4)
        pdf_url = _signed_pdf_url(paper, dry_run)

        _t0 = time.monotonic()
        if engine == "dagster":
            try:
                import dagster_flow  # imported only on the dagster path; main never needs dagster
                result = dagster_flow.run_via_dagster(
                    pdf_url=pdf_url, figure_label=figure_label, target=target, no_llm=dry_run,
                )
            except Exception as e:  # noqa: BLE001 — dagster missing/errored: fall back, never drop the job
                print(f"  dagster engine unavailable ({e}); falling back to direct")
                engine = "direct"
                intake["engine"] = "direct"
                result = processor.run(
                    pdf_url=pdf_url, figure_label=figure_label, target=target, no_llm=dry_run,
                )
        elif engine == "flow_v2":
            # The gated, figure-anchored, per-variable flow (read_figure → per-variable gates →
            # deterministic assemble). Adapt its output to the worker's result shape.
            try:
                import flow_v2
                from schema import checksums_for
                fv = flow_v2.run_from_pdf(
                    pdf_url=pdf_url, figure_label=figure_label,
                    region=(target or {}).get("region"), no_llm=dry_run,
                )
                staged = fv["staged"]
                result = {
                    "model": staged.model.model_dump(),
                    "checksums": checksums_for(staged.model),
                    # the gated-flow audit, stored with the extraction so the gates are observable
                    "flow_v2": {"crosscheck": fv["crosscheck"], "gate_log": fv["gate_log"],
                                "figure_read_wired": fv["figure_read_wired"],
                                "classification": fv.get("classification"),
                                "executable": fv.get("executable")},
                }
            except Exception as e:  # noqa: BLE001 — flow_v2 missing/errored: fall back, never drop the job
                print(f"  flow_v2 engine unavailable ({e}); falling back to direct")
                engine = "direct"
                intake["engine"] = "direct"
                result = processor.run(
                    pdf_url=pdf_url, figure_label=figure_label, target=target, no_llm=dry_run,
                )
        else:
            result = processor.run(
                pdf_url=pdf_url, figure_label=figure_label, target=target, no_llm=dry_run,
            )
        extract_ms = int((time.monotonic() - _t0) * 1000)  # the speed dimension for S3

        db.update_job(conn, job_id, stage="machine_verify", progress=0.8)
        model = {**result["model"], "_checksums": result["checksums"]}
        fig_prov = result.get("figure_provenance")
        if fig_prov:
            model["_figure_provenance"] = fig_prov  # which figure was isolated: page/bbox/tool/dual SHA
        if result.get("flow_v2"):
            model["_flow_v2"] = result["flow_v2"]  # gated-flow audit (crosscheck + per-variable gate log)
            _cls = result["flow_v2"].get("classification")
            if _cls:
                model["_classification"] = _cls  # formulation family (registry-matched, evidence-anchored)
            _exe = result["flow_v2"].get("executable")
            if _exe:
                model["_executable"] = _exe  # executable curation model (only if it passed the safety guard)
        pid = str(job["paper_id"])
        # Hooks (best-effort telemetry → validation_events): the extract + locate stages.
        locs = result.get("locations") or {}
        hooks.emit(conn, point="extract", subject_kind="agent", outcome="pass",
                   job_id=job_id, paper_id=pid, thread_id=job_id, latency_ms=extract_ms,
                   subject_id=f"extractor:{processor.MODEL}",
                   tags={**intake,
                         "vars": len(model.get("variables") or []),
                         "params": len(model.get("parameters") or []),
                         "drift": len(model.get("drift_terms") or []),
                         "diffusion": len(model.get("diffusion_terms") or [])})
        hooks.emit(conn, point="locate", subject_kind="script",
                   outcome="pass" if locs.get("located") else "flag",
                   job_id=job_id, paper_id=pid, thread_id=job_id,
                   subject_id="locator:pdfplumber", tags={**intake, **locs})
        # Figure isolation seam (deterministic): which single figure anchored this extraction.
        hooks.emit(conn, point="isolate", subject_kind="script",
                   outcome="pass" if fig_prov else "skip",
                   job_id=job_id, paper_id=pid, thread_id=job_id,
                   subject_id="figures:pymupdf",
                   tags={**intake, **({"page": fig_prov.get("page"), "label": fig_prov.get("label"),
                                       "image_sha256": (fig_prov.get("image_sha256") or "")[:16]}
                                      if fig_prov else {})})
        # The figure is the anchor — record WHICH figure was extracted. 'auto' means the engine
        # chose; store its choice (the model's own figure_label), not the '(auto)' placeholder.
        figure = (model.get("figure_label") or "").strip() or figure_label or "(figure)"
        ext_id = db.write_extraction(
            conn,
            paper_id=pid,
            figure_label=figure,
            model=model,
            pathogen=paper.get("pathogen"),
            doi=paper.get("doi"),
            file_sha256=paper.get("file_sha256"),
            status="needs_human",
            lane=target.get("lane"),  # walkthrough / bulk — so Bulk can hide Walkthrough work
        )
        db.update_job(conn, job_id, stage="stored", progress=1.0)
        hooks.emit(conn, point="store", subject_kind="script", outcome="pass",
                   job_id=job_id, paper_id=pid, thread_id=job_id, subject_id="storage",
                   lineage_ref=ext_id, tags={**intake, "status": "needs_human"})
        # Per-gate seams (flow_v2): one validation_event per variable per gate — the gated flow made
        # observable (recorded-transformation rule 5). subject = the variable; lineage = the stored
        # extraction; every gate wraps back to the figure (tag). No-op on non-flow_v2 engines.
        for _sym, _gates in ((result.get("flow_v2") or {}).get("gate_log") or {}).items():
            for _g in _gates:
                _v = _g.get("verdict")
                hooks.emit(conn, point=f"gate:{_g.get('gate')}", subject_kind="agent",
                           outcome={"agree": "pass", "disagree": "fail"}.get(_v, "flag"),
                           job_id=job_id, paper_id=pid, thread_id=job_id,
                           subject_id=f"var:{_sym}", lineage_ref=ext_id,
                           tags={**intake, "gate": _g.get("gate"), "verdict": _v, "figure": figure,
                                 "wired": (_g.get("detection") or {}).get("wired", False)})
        # Classify seam: which formulation family the model was identified as (or unclassified / new → HITL).
        _cls = (result.get("flow_v2") or {}).get("classification") or {}
        if _cls:
            fam = _cls.get("family_name") or "unclassified"
            hooks.emit(conn, point="classify", subject_kind="agent",
                       outcome="flag" if (fam == "unclassified" or _cls.get("family_is_new")) else "pass",
                       job_id=job_id, paper_id=pid, thread_id=job_id, subject_id="classifier:formulation_family",
                       lineage_ref=ext_id, tags={**intake, "figure": figure, "family": fam,
                                                 "family_is_new": _cls.get("family_is_new", False),
                                                 "calculus": _cls.get("calculus_convention")})
        # Transform seam: did we produce a SAFE executable curation model (passed the AST guard)? No run,
        # no verdict here — just whether an executable model was built. pass = safe code; flag otherwise.
        _exe = (result.get("flow_v2") or {}).get("executable") or {}
        if _exe.get("wired"):
            hooks.emit(conn, point="transform", subject_kind="agent",
                       outcome="pass" if _exe.get("safe") else "flag",
                       job_id=job_id, paper_id=pid, thread_id=job_id, subject_id="transform:executable_model",
                       lineage_ref=ext_id, tags={**intake, "figure": figure, "safe": _exe.get("safe", False),
                                                 "code_sha256": (_exe.get("code_sha256") or "")[:16],
                                                 "reasons": (_exe.get("reasons") or [])[:3]})
        print(f"job {job_id}: stored extraction {ext_id} (needs_human)")
        # Capture the FULL orchestration run (Dagster path only) into OUR store — the observability is
        # the whole point. Best-effort: never let a telemetry write fail the job.
        orch = result.get("orchestration") if engine == "dagster" else None
        if orch:
            try:
                db.write_orchestration_run(
                    conn, run_id=orch.get("run_id"), job_id=job_id, paper_id=pid, engine=engine,
                    status="success" if orch.get("success") else "failed",
                    duration_ms=orch.get("duration_ms"), event_count=orch.get("event_count"),
                    steps=orch.get("steps"), events=orch.get("events"),
                )
                print(f"job {job_id}: captured orchestration run {orch.get('run_id')} "
                      f"({orch.get('event_count')} events)")
            except Exception as e:  # noqa: BLE001 — capture must never break the job
                print(f"  orchestration capture write failed: {e}")
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
