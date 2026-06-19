"""Test workflow stack: Dagster layered OVER the existing extraction pipeline.

[memory: announce-before-building-gate / dagster-ui-is-internal-not-a-user-site] This is NOT a separate
app or engine. It is a thin Dagster LAYER that runs the SAME real functions the worker uses
(services/extraction: figures, processor, oracle), so the existing pipeline's stages become explicit,
ordered, observable steps you can run on this test branch — to see whether making the deterministic
moments concrete (and confining the LLM to one node) is worth it. It writes nothing new, deploys
nothing, and shares no separate database. Run it locally:

    uv run dg launch --assets reproduction_record \
      --config '{"ops":{"reproduction_record":{"ops":{"detect_figures":{"config":{"pdf_path":"...","no_llm":true}}}}}}'

Stages (mirroring the real pipeline):
  - detect_figures  DETERMINISTIC  - real figures.detect_serializable + isolate the human's pick
  - extract         the ONE LLM node - real processor.run (dry-run by default; set no_llm=false + a key for real)
  - reproduce       DETERMINISTIC  - real oracle.run_reproduction when an executable model exists; else honest not_run

Planned next layer (NOT faked here): the extractor assembles an ExecutableModel (drift/diffusion code) so
reproduce yields a real verdict, and a per-variable classifier fan-out. Those are future nodes.
"""

import sys
from pathlib import Path

import dagster as dg

# --- wire the REAL extraction machinery onto the path (same modules the worker uses) ---
_EXTRACTION = Path(__file__).resolve().parents[3].parent / "extraction"
if str(_EXTRACTION) not in sys.path:
    sys.path.insert(0, str(_EXTRACTION))

import transform as tr  # noqa: E402  (ReproductionRecord — the two-part verdict)


class ChosenFigure(dg.Config):
    """The run input: which PDF, the ONE figure/panel the human picked, and whether to call the LLM.
    no_llm defaults True so the workflow runs locally with NO OpenAI spend (the real dry-run seam)."""

    pdf_path: str
    page: int | None = None
    bbox_norm: list[float] | None = None  # [x0, y0, x1, y1] — the human's pick
    label: str | None = None
    scale: float = 2.0
    no_llm: bool = True


def _seam(context, name, **fields):
    """One structured log line per node — the observability seam (a validation_event)."""
    detail = " ".join(f"{k}={v}" for k, v in fields.items())
    context.log.info(f"[seam:{name}] {detail}")


# --- DETERMINISTIC: real figure detection + isolation -------------------------------------
@dg.op
def detect_figures(context, config: ChosenFigure) -> dict:
    import figures as figmod  # the SAME detector the worker uses

    detected = figmod.detect_serializable(config.pdf_path)
    if config.page is not None and config.bbox_norm:
        iso = figmod.isolate_region(config.pdf_path, page=config.page, bbox_norm=config.bbox_norm,
                                    label=config.label, scale=config.scale)
    else:
        iso = figmod.isolate_figure(config.pdf_path, label=config.label, scale=config.scale)
    if iso is None:
        raise dg.Failure(f"no figure detected in {config.pdf_path}")
    region, prov = iso["region"], iso["provenance"]
    chosen = {
        "label": region.label, "page": region.page, "bbox_norm": list(region.bbox_norm),
        "source_sha256": prov.source_sha256, "image_sha256": prov.image_sha256,
        "n_detected": len(detected), "pdf_path": config.pdf_path, "no_llm": config.no_llm,
    }
    _seam(context, "figure-detect", n_detected=len(detected), page=region.page, label=region.label)
    context.add_output_metadata({
        "n_detected": len(detected), "chosen_page": region.page,
        "chosen_label": str(region.label), "image_sha256": prov.image_sha256,
    })
    return chosen


# --- THE ONE LLM NODE: real extraction brain (processor.run) ------------------------------
@dg.op
def extract(context, chosen: dict) -> dict:
    import processor  # the SAME brain the worker calls

    no_llm = bool(chosen.get("no_llm", True))
    pdf_url = Path(chosen["pdf_path"]).resolve().as_uri()  # file:// URL works with processor._download
    target = {
        "mode": "figure",
        "figure_ref": chosen.get("label"),
        "region": {"page": chosen["page"], "bbox_norm": chosen["bbox_norm"]},
    }
    out = processor.run(
        pdf_url=pdf_url, figure_label=str(chosen.get("label") or ""),
        target=target, no_llm=no_llm,
    )
    model = out.get("model", {})
    _seam(context, "extract", dry_run=no_llm,
          variables=len(model.get("variables") or []),
          parameters=len(model.get("parameters") or []))
    context.add_output_metadata({
        "dry_run": no_llm,
        "note": "dry-run stub (no LLM)" if no_llm else "real OpenAI extraction",
    })
    return out


# --- DETERMINISTIC: verify by re-simulation (real oracle when a runnable model exists) -----
@dg.op
def reproduce(context, extraction: dict) -> dict:
    record = tr.ReproductionRecord()
    model = (extraction or {}).get("model", {})
    # The extractor does not assemble an executable drift/diffusion model yet, so there is nothing to
    # run -> honest not_run. When that lands, build ExecutableModel here and call oracle.run_reproduction.
    has_executable = bool(model.get("drift_code"))
    if has_executable:
        import oracle
        oracle.run_reproduction(record.model, record=record)  # future path
    else:
        record.note = "no executable model assembled yet (extractor returns present/absent slots) - verdict deferred"
        record.decide()  # not_run
    _seam(context, "reproduce_check", status=record.status, figure_reproduced=record.figure_reproduced)
    context.add_output_metadata({"status": record.status, "note": record.note,
                                 "seam_points": ", ".join(tr.SEAM_POINTS)})
    return record.model_dump()


@dg.graph_asset(group_name="sde_extraction")
def reproduction_record() -> dict:
    """One paper through the real pipeline, run as observable Dagster stages: detect -> extract ->
    verify. The asset IS the kept ReproductionRecord. Layer over the existing worker, not a new system."""
    chosen = detect_figures()
    return reproduce(extract(chosen))
