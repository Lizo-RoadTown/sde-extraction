"""agents_v2 — the LLM GATES for flow_v2. The only fuzzy part; everything around them is deterministic.

Each function is one gate's agent action (read the paper / validate), using the SAME OpenAI + Pydantic
brain as processor.py (`client.responses.parse` with a Pydantic `text_format`, processor.py:140). Kept
in its own module so flow_v2 stays import-clean (no LLM at import). Honest: `no_llm=True` (or no PDF)
returns a stub so the deterministic flow runs end-to-end without spend.

First gate wired: read_figure — the figure → variable-checklist read (the anchor of everything).
"""
from __future__ import annotations

import base64
import os
from typing import Any, Optional

from assemble import absent_slot
from classification import ModelClassification, registry_reference
from schema import FigureRead, TimeSpan, VariableExtraction


READ_FIGURE_SYSTEM = """You read ONE figure from a stochastic-differential-equation (SDE) epidemiological paper.

Return the figure's identity and — most important — the CHECKLIST of state variables it plots: one entry
in `panels` per variable shown, in order (e.g. ["S(t)","I(t)","R(t)"]). This checklist drives a separate
extractor per variable downstream, so list exactly the state variables this figure plots — no more, no
fewer. Rules: extract only what the figure/paper shows or states; if the time span is not stated, mark it
absent; invent nothing."""


def _stub_figure_read(figure_label: str) -> FigureRead:
    return FigureRead(
        figure_label=figure_label or "(figure)", figure_type="", outcome="", pathogen="",
        panels=[], time_span=TimeSpan(initial_time=absent_slot(), final_time=absent_slot()),
    )


def read_figure(
    *, pdf_url: Optional[str], figure_label: str,
    region: Optional[dict[str, Any]] = None, no_llm: bool = False,
) -> FigureRead:
    """Gate 0 (the anchor): read the chosen figure into a FigureRead whose `panels` are the variable
    checklist. Attaches the isolated figure IMAGE (the anchor) + the PDF (for the text), exactly like
    processor.run. Returns a stub on no_llm / no PDF so the deterministic spine still runs."""
    if no_llm or not pdf_url:
        return _stub_figure_read(figure_label)

    from openai import OpenAI  # lazy — dry-run / import paths need no openai

    import figures as F
    from processor import MODEL, _download

    client = OpenAI()  # reads OPENAI_API_KEY
    pdf_path = _download(pdf_url)
    try:
        with open(pdf_path, "rb") as f:
            uploaded = client.files.create(file=f, purpose="user_data")
        content: list[dict[str, Any]] = [{"type": "input_file", "file_id": uploaded.id}]
        # the figure image is the anchor — isolate the exact panel the human picked (deterministic crop)
        try:
            if region:
                iso = F.isolate_region(pdf_path, page=int(region["page"]),
                                      bbox_norm=region["bbox_norm"], label=figure_label)
            else:
                iso = F.isolate_figure(pdf_path, label=figure_label or None)
        except Exception:  # noqa: BLE001 — isolation is best-effort; never block the read
            iso = None
        if iso:
            content.append({"type": "input_image",
                            "image_url": "data:image/png;base64," + base64.b64encode(iso["png"]).decode()})
        content.append({"type": "input_text", "text": (
            f"The attached image is the target figure ({figure_label}). Read it into the schema: list each "
            f"plotted state variable as a panels[] entry (the variable checklist), in order; plus figure_type, "
            f"outcome, pathogen, and the time span if the paper states it."
        )})
        resp = client.responses.parse(
            model=MODEL,
            input=[{"role": "system", "content": READ_FIGURE_SYSTEM},
                   {"role": "user", "content": content}],
            text_format=FigureRead,
        )
        return resp.output_parsed
    finally:
        try:
            os.remove(pdf_path)
        except OSError:
            pass


# ---- gate 1: terms — the per-variable agent (one per variable, scoped to its equation) ----------

EXTRACT_VARIABLE_SYSTEM = """You extract ONE state variable's stochastic equation from an SDE epidemiological paper.

For the given variable, find ITS equation in the paper (the one feeding the chosen figure) and return,
VERBATIM as written (with the exact source quote and page), present/absent each:
- meaning: what the variable represents
- initial_value: its initial condition
- drift: the deterministic right-hand side (the dt part of d{var} = (...)dt + (...)dW)
- diffusion: the stochastic/noise right-hand side (the dW part)
- parameters: the constants appearing in THIS variable's equation only (each with value/meaning/units,
  present/absent). Shared constants are reconciled across variables later by a script — just grab the
  ones in this equation.

Rules: transcribe exactly, never evaluate or simplify; if something is not stated, mark it absent with a
reason; never guess. This is ONE variable, scoped to its own equation."""


def _stub_variable(symbol: str) -> VariableExtraction:
    return VariableExtraction(
        symbol=symbol, meaning=absent_slot(), initial_value=absent_slot(),
        drift=absent_slot(), diffusion=absent_slot(), parameters=[],
    )


def extract_variable(
    *, symbol: str, figure_read: FigureRead, pdf_url: Optional[str],
    region: Optional[dict[str, Any]] = None, no_llm: bool = False,
) -> VariableExtraction:
    """Gate 1 (per variable): the variable's own agent reads ITS equation for this figure and returns a
    VariableExtraction (drift, diffusion, meaning, initial_value, + the params in its equation). Same
    OpenAI+Pydantic brain as read_figure. Returns a stub on no_llm / no PDF (deterministic spine runs)."""
    if no_llm or not pdf_url:
        return _stub_variable(symbol)

    from openai import OpenAI  # lazy

    from processor import MODEL, _download

    client = OpenAI()
    pdf_path = _download(pdf_url)
    try:
        with open(pdf_path, "rb") as f:
            uploaded = client.files.create(file=f, purpose="user_data")
        instruction = (
            f"The figure is '{figure_read.figure_label}' (pathogen: {figure_read.pathogen or 'n/a'}). "
            f"Extract the stochastic equation for the variable '{symbol}' only, into the schema."
        )
        resp = client.responses.parse(
            model=MODEL,
            input=[{"role": "system", "content": EXTRACT_VARIABLE_SYSTEM},
                   {"role": "user", "content": [
                       {"type": "input_file", "file_id": uploaded.id},
                       {"type": "input_text", "text": instruction},
                   ]}],
            text_format=VariableExtraction,
        )
        ve = resp.output_parsed
        ve.symbol = symbol  # anchor to the checklist symbol, not whatever the model echoed
        return ve
    finally:
        try:
            os.remove(pdf_path)
        except OSError:
            pass


# ---- classify gate: identify the model's formulation family against the registry ---------------

CLASSIFY_SYSTEM = """You identify which stochastic FORMULATION FAMILY a lifted SDE epidemiological model
belongs to, matching it against a KNOWN REGISTRY. Identification only — never change the model's values.

Rules: anchor your call to the paper with a verbatim evidence_quote + page so it can be verified. If you
cannot determine the family, set family_name='unclassified'. If the model is a real family NOT in the
registry, set family_is_new=true and propose a name (a human audits it before it joins the registry).
Also record the calculus convention (Itô/Stratonovich, if stated) and any transformations from the
registry that were applied.

REGISTRY (match against these names; do not invent names unless family_is_new=true):
%s"""


def classify_model(
    *, model_dump: dict[str, Any], figure_read: FigureRead,
    pdf_url: Optional[str], no_llm: bool = False,
) -> ModelClassification:
    """Classify the assembled model's formulation family against classification.FORMULATION_FAMILIES.
    Registry-matched + evidence-anchored (verifiable), with the candidate-HITL flag for new families.
    Returns 'unclassified' on no_llm / no PDF so the deterministic spine still runs."""
    if no_llm or not pdf_url:
        return ModelClassification(family_name="unclassified")

    from openai import OpenAI  # lazy

    from processor import MODEL, _download

    client = OpenAI()
    pdf_path = _download(pdf_url)
    try:
        with open(pdf_path, "rb") as f:
            uploaded = client.files.create(file=f, purpose="user_data")
        instr = (
            f"Figure '{figure_read.figure_label}' (pathogen: {figure_read.pathogen or 'n/a'}). The lifted "
            f"model has variables {[v.get('symbol') for v in model_dump.get('variables', [])]} and "
            f"parameters {[p.get('symbol') for p in model_dump.get('parameters', [])]}, with drift and "
            f"diffusion terms. Identify its formulation family against the registry, with evidence."
        )
        resp = client.responses.parse(
            model=MODEL,
            input=[{"role": "system", "content": CLASSIFY_SYSTEM % registry_reference()},
                   {"role": "user", "content": [
                       {"type": "input_file", "file_id": uploaded.id},
                       {"type": "input_text", "text": instr},
                   ]}],
            text_format=ModelClassification,
        )
        return resp.output_parsed
    finally:
        try:
            os.remove(pdf_path)
        except OSError:
            pass


# ---- the per-variable gate agent (real detect for `terms`; classify is model-level) -------------

def make_agent(*, pdf_url: Optional[str], region: Optional[dict[str, Any]] = None, no_llm: bool = False):
    """Build the flow_v2.Agent whose detect/validate are wired for the gates we've implemented. Gate
    `terms` runs the per-variable extractor; later gates return honest 'not wired' until built. The
    per-variable thread is the VariableState the runner carries gate to gate."""
    from flow_v2 import Agent  # lazy: flow_v2 never imports agents_v2 at module top, so no cycle

    def _present(slot: Any) -> bool:
        return getattr(slot, "status", None) == "present"

    def detect(symbol, gate, figure_read, state) -> dict[str, Any]:
        if gate.key == "terms":
            ve = extract_variable(symbol=symbol, figure_read=figure_read, pdf_url=pdf_url,
                                  region=region, no_llm=no_llm)
            # write the extraction into the per-variable thread
            state.meaning = ve.meaning
            state.initial_value = ve.initial_value
            state.drift = ve.drift
            state.diffusion = ve.diffusion
            state.parameters = ve.parameters
            return {"wired": bool(pdf_url) and not no_llm, "gate": "terms",
                    "drift_present": _present(ve.drift), "diffusion_present": _present(ve.diffusion),
                    "n_params": len(ve.parameters)}
        return {"wired": False, "gate": gate.key}  # noise_structure / form / parameters: not built yet

    def validate(symbol, gate, state):
        from contracts import SlotVerdict
        if gate.key == "terms":
            ok = _present(state.drift) or _present(state.diffusion)
            return SlotVerdict(field_path=f"{symbol}:terms",
                               verdict="agree" if ok else "uncertain",
                               rationale="drift/diffusion captured" if ok else "no term captured")
        return SlotVerdict(field_path=f"{symbol}:{gate.key}", verdict="uncertain", rationale="agent not wired")

    def classify(model_dump, figure_read):
        return classify_model(model_dump=model_dump, figure_read=figure_read,
                              pdf_url=pdf_url, no_llm=no_llm).model_dump()

    return Agent(detect=detect, validate=validate, classify=classify)
