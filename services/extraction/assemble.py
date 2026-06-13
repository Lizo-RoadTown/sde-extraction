"""Deterministic assembly — the SCRIPT stages between the LLM sub-agents (no LLM here).

Given the figure read (anchor + checklist) and one VariableExtraction per checklist variable,
this:
  - reconcile_params: dedup the shared params (β, σ, …) each per-variable agent captured into the
    system's single parameter set (commands/spec: per-var agent grabs ITS equation's params;
    a SCRIPT reconciles — precise work, no LLM),
  - assemble_model: build the canonical FigureExtraction (variables + drift/diffusion terms + params),
  - crosscheck: figure panels vs captured variables → the completeness gate that catches "3 of 5".

Pure Python over schema.py / contracts.py — safe to import anywhere; deterministic by construction.
"""

from __future__ import annotations

import re
from typing import Any

from contracts import ChecklistGap
from schema import (
    FigureExtraction,
    FigureRead,
    Parameter,
    Slot,
    Term,
    Variable,
    VariableExtraction,
    Absent,
    AbsenceReason,
    Present,
)


def _sym(label: str) -> str:
    """Base symbol of a variable label: 'x(t)' -> 'x', 'I (t)' -> 'i'."""
    return re.sub(r"\(.*?\)", "", label or "").strip().lower()


def _is_present(slot: Slot) -> bool:
    return isinstance(slot, Present)


def reconcile_params(ves: list[VariableExtraction]) -> list[Parameter]:
    """Dedup params across variables by symbol; prefer the occurrence with a PRESENT value
    (then present meaning/units). Shared constants like β/σ collapse to one system-level entry."""
    best: dict[str, Parameter] = {}
    for ve in ves:
        for p in ve.parameters:
            key = _sym(p.symbol)
            if not key:
                continue
            cur = best.get(key)
            if cur is None:
                best[key] = p
                continue
            # prefer the one that pins more present slots (value first, then meaning, then units)
            def score(x: Parameter) -> int:
                return (2 if _is_present(x.value) else 0) + (1 if _is_present(x.meaning) else 0) + (1 if _is_present(x.units) else 0)
            if score(p) > score(cur):
                best[key] = p
    # stable order by symbol
    return [best[k] for k in sorted(best)]


def assemble_model(figure_read: FigureRead, ves: list[VariableExtraction]) -> FigureExtraction:
    """Combine the figure anchor + per-variable extractions into the canonical FigureExtraction."""
    variables = [
        Variable(symbol=ve.symbol, meaning=ve.meaning, initial_value=ve.initial_value)
        for ve in ves
    ]
    drift_terms = [Term(variable=ve.symbol, expression=ve.drift) for ve in ves]
    diffusion_terms = [Term(variable=ve.symbol, expression=ve.diffusion) for ve in ves]
    parameters = reconcile_params(ves)
    return FigureExtraction(
        figure_label=figure_read.figure_label,
        figure_type=figure_read.figure_type,
        outcome=figure_read.outcome,
        pathogen=figure_read.pathogen,
        variables=variables,
        parameters=parameters,
        drift_terms=drift_terms,
        diffusion_terms=diffusion_terms,
        time_span=figure_read.time_span,
    )


def crosscheck(panels: list[str], model: FigureExtraction) -> tuple[list[ChecklistGap], dict[str, Any]]:
    """The completeness gate: figure panels (what the figure plots) vs captured variables.
    Returns per-symbol gaps + a summary. `missing` = the figure shows it but the model didn't
    capture it — exactly the '5 panels, 3 captured' failure, now flagged instead of silent."""
    panel_syms = [s for s in (_sym(p) for p in panels) if s]
    captured_syms = [s for s in (_sym(v.symbol) for v in model.variables) if s]
    gaps: list[ChecklistGap] = []
    for ps in panel_syms:
        if ps in captured_syms:
            gaps.append(ChecklistGap(symbol=ps, status="captured"))
        else:
            gaps.append(ChecklistGap(symbol=ps, status="missing", note="figure plots it; model didn't capture it"))
    for cs in captured_syms:
        if cs not in panel_syms:
            gaps.append(ChecklistGap(symbol=cs, status="extra", note="captured but not seen as a figure panel"))
    missing = [g.symbol for g in gaps if g.status == "missing"]
    summary = {
        "panel_count": len(panel_syms),
        "captured_count": len(captured_syms),
        "missing": missing,
        "complete": len(missing) == 0 and len(panel_syms) > 0,
    }
    return gaps, summary


# absent helper for nodes that need to fill an empty slot deterministically
def absent_slot(reason: str = "not_stated") -> Absent:
    return Absent(status="absent", reason=AbsenceReason(reason))
