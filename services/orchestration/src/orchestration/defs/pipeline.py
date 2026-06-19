"""Skeleton extraction pipeline — the deterministic backbone as a Dagster graph.

[memory: orchestrator-engine-is-dagster] A dynamic-task-mapping DAG: every deterministic moment is a
node (observable, retriable, with a logged seam); only the figure-read and the per-variable LIFT are
autonomous — those are subagent PLACEHOLDERS here, not yet built. The per-variable fan-out is real
Dagster dynamic mapping (DynamicOut / .map / .collect).

The reproducibility core uses the REAL recorded-transformation machinery (services/extraction: schema,
classification, transform) — and emits NO fabricated verdict: with no executable model + diffrax oracle
wired yet, the verdict is honestly 'not_run'.

Canonical stage order: figure-detect -> figure-read -> per-variable fan-out -> reconcile -> verify(re-sim).

What is REAL here vs a labelled placeholder:
  - REAL: the per-variable Pydantic classifier layer (VariableClassification + match_role registry gate),
    the recorded TermTransform shape, the ReproductionRecord two-part verdict, the graph + dynamic fan-out.
  - PLACEHOLDER (clearly marked): figure detection (real impl = figures.detect_serializable + human pick),
    the figure-read subagent, and the per-variable lift content (the subagents are not yet built).
"""

import sys
from pathlib import Path

import dagster as dg

# --- wire the REAL extraction machinery (pydantic-only modules) onto the path ---
_EXTRACTION = Path(__file__).resolve().parents[3].parent / "extraction"
if str(_EXTRACTION) not in sys.path:
    sys.path.insert(0, str(_EXTRACTION))

import classification as c  # noqa: E402  (controlled registries + the Pydantic classifier layer)
import transform as tr      # noqa: E402  (recorded-transformation machinery + two-part verdict)
import figures as figmod    # noqa: E402  (real figure detection + isolation — PyMuPDF)
from schema import Present   # noqa: E402  (a present/absent Slot for the verbatim term)


class ChosenFigure(dg.Config):
    """The run input: which PDF, and the ONE figure/panel the human picked. The pick is anchored by
    bbox (page + bbox_norm) when given — panels share a label, so the human's box IS the truth
    (figures.isolate_region). Falls back to label, else the largest-area figure."""

    pdf_path: str
    page: int | None = None
    bbox_norm: list[float] | None = None  # [x0, y0, x1, y1], page-normalized — the human's pick
    label: str | None = None
    scale: float = 2.0


def _seam(context, name, **fields):
    """One structured log line per node — the observability seam (a validation_event)."""
    detail = " ".join(f"{k}={v}" for k, v in fields.items())
    context.log.info(f"[seam:{name}] {detail}")


def _mapping_key(symbol):
    """Dagster mapping keys must be alphanumeric/underscore."""
    return "".join(ch if ch.isalnum() else "_" for ch in symbol) or "var"


# --- DETERMINISTIC: figure detection + isolation (REAL) ------------------------------
# Runs the real detector (figures.detect_serializable) for observability of what was found, then
# isolates the ONE figure/panel the human picked (anchored by bbox when given). Records dual SHA-256
# provenance (source PDF + isolated image) — the lift's first recorded seam, grounded in reality.
@dg.op
def detect_figures(context, config: ChosenFigure) -> dict:
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
        "n_detected": len(detected),
    }
    _seam(context, "figure-detect", n_detected=len(detected), page=region.page,
          label=region.label, image_sha256=prov.image_sha256[:12])
    context.add_output_metadata({
        "n_detected": len(detected), "chosen_page": region.page,
        "chosen_label": str(region.label), "image_sha256": prov.image_sha256,
        "source_sha256": prov.source_sha256,
    })
    return chosen


# --- AUTONOMOUS (subagent placeholder): read the model off the chosen figure ----------
# Real impl: a vision-LLM subagent returns the state-variable checklist for that panel.
@dg.op
def read_model(context, chosen: dict) -> list:
    variables = ["S", "I", "R"]  # PLACEHOLDER for the figure-read subagent
    _seam(context, "figure-read", variables=variables,
          note="placeholder; real impl = vision-LLM subagent")
    return variables


# --- DETERMINISTIC: per-variable FAN-OUT (Dagster dynamic mapping) --------------------
@dg.op(out=dg.DynamicOut(str))
def fan_out_variables(context, variables: list):
    _seam(context, "fan-out", count=len(variables))
    for sym in variables:
        yield dg.DynamicOutput(sym, mapping_key=_mapping_key(sym))


# --- AUTONOMOUS (subagent placeholder), one per variable -----------------------------
# The lift CONTENT is a placeholder (subagent not wired), but the call is gated by the REAL
# Pydantic classifier layer: the role is validated against the controlled registry (match_role);
# an unknown role would route to the candidate HITL track. This is the deterministic control.
@dg.op
def extract_variable(context, symbol: str) -> dict:
    vc = c.VariableClassification(
        symbol=symbol, role="unclassified",
        rationale="placeholder; per-variable subagent not yet wired",
    )
    classified = c.match_role(vc.role) is not None  # registry gate (deterministic)
    before = Present(status="present", value=f"f({symbol})", meaning="drift",
                     quote=f"d{symbol} = f({symbol}) dt", page=2)
    term = tr.TermTransform(field_path=f"drift_terms[{symbol}]", variable=symbol, before=before, after="")
    _seam(context, "transform", variable=symbol, role=vc.role,
          classified=classified, steps_valid=term.steps_valid(),
          note="placeholder lift; classifier layer + registry gate are real")
    return {"classification": vc.model_dump(), "term": term.model_dump()}


# --- DETERMINISTIC: reconcile per-variable results into one record --------------------
@dg.op
def reconcile(context, per_variable: list) -> dict:
    terms = [tr.TermTransform(**pv["term"]) for pv in per_variable]
    record = tr.ReproductionRecord(term_transforms=terms)
    _seam(context, "reconcile", variables=len(terms))
    return record.model_dump()


# --- DETERMINISTIC: verify by re-simulation (the REAL reproduction oracle) -------------
# If a runnable ExecutableModel exists, run the BioModels diffrax harness twice at a fixed seed and let
# the two-part verdict decide (oracle.run_reproduction -> ReproductionRecord.decide). With the per-
# variable subagent lift not yet wired, no model is assembled -> the verdict is honestly 'not_run'
# (NEVER a guessed verdict). The oracle itself is real and tested (tests/test_oracle.py).
@dg.op
def reproduce(context, record_dict: dict) -> dict:
    record = tr.ReproductionRecord(**record_dict)
    if record.model is not None and (record.model.drift_code or "").strip():
        import oracle  # lazy: pulls diffrax/jax only when there's a model to run
        oracle.run_reproduction(record.model, seed=record.seed, record=record)
    else:
        record.note = "no executable model (per-variable subagent lift not wired) - verdict deferred"
        record.decide()  # ran_ok=None, no result hashes -> 'not_run'
    _seam(context, "reproduce_check", status=record.status,
          figure_reproduced=record.figure_reproduced)
    context.add_output_metadata({
        "status": record.status,
        "figure_reproduced": str(record.figure_reproduced),
        "variables": len(record.term_transforms),
        "seam_points": ", ".join(tr.SEAM_POINTS),
        "note": record.note,
    })
    return record.model_dump()


@dg.graph_asset(group_name="sde_extraction")
def reproduction_record() -> dict:
    """One paper's recorded transformation + reproduction verdict, produced by the deterministic
    backbone with a per-variable subagent fan-out. The asset IS the kept ReproductionRecord."""
    chosen = detect_figures()
    variables = read_model(chosen)
    per_variable = fan_out_variables(variables).map(extract_variable)
    return reproduce(reconcile(per_variable.collect()))
