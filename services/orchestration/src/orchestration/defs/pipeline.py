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
from schema import Present   # noqa: E402  (a present/absent Slot for the verbatim term)


def _seam(context, name, **fields):
    """One structured log line per node — the observability seam (a validation_event)."""
    detail = " ".join(f"{k}={v}" for k, v in fields.items())
    context.log.info(f"[seam:{name}] {detail}")


def _mapping_key(symbol):
    """Dagster mapping keys must be alphanumeric/underscore."""
    return "".join(ch if ch.isalnum() else "_" for ch in symbol) or "var"


# --- DETERMINISTIC: figure detection -------------------------------------------------
# Real impl: figures.detect_serializable(pdf) finds the figures, the human picks ONE panel.
# Skeleton: a fixed chosen-figure descriptor so the graph runs end to end.
@dg.op
def detect_figures(context) -> dict:
    chosen = {"label": "2", "page": 2}  # PLACEHOLDER for figures.detect + human pick
    _seam(context, "figure-detect", chosen=chosen,
          note="placeholder; real impl = figures.detect_serializable + human pick")
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


# --- DETERMINISTIC: verify by re-simulation (the reproduction oracle) -----------------
# Real impl: build ExecutableModel -> diffrax (Euler-Maruyama, fixed seed) twice -> hash-compare.
# Skeleton: no executable model wired -> verdict is honestly 'not_run' (NEVER a guessed verdict).
@dg.op
def reproduce(context, record_dict: dict) -> dict:
    record = tr.ReproductionRecord(**record_dict)
    record.note = "executable model + diffrax oracle not wired yet"
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
