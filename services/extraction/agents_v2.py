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

from pydantic import BaseModel

from assemble import absent_slot
from classification import ModelClassification, registry_reference
from classification import TRANSFORMATIONS as _TRANSFORMATIONS
from schema import FigureRead, TimeSpan, VariableExtraction
from transform import ExecutableModel, safe_code_check, sha256_text


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


# ---- transform gate: verbatim terms -> executable curation model (behind the safety guard) -----

class _VarCode(BaseModel):
    """The LLM's proposed executable form for ONE variable's equation."""
    symbol: str
    drift_rhs: str = ""          # executable Python expression for this variable's drift (uses y[],p[])
    diffusion_rhs: str = ""      # ... its diffusion
    initial_value: float = 0.0   # numeric initial condition
    steps: list[str] = []        # classification.TRANSFORMATIONS names applied (or proposed new)


class _NamedValue(BaseModel):
    """A (parameter, numeric value) pair — a list of these instead of an open dict, since strict
    structured outputs reject open-ended dict[str, float]."""
    name: str
    value: float = 0.0


class ExecutableProposal(BaseModel):
    """The LLM's proposed executable curation model: per-variable RHS + the index orders + numerics.
    A SCRIPT (build_executable) assembles drift_code/diffusion_code from this and SAFETY-CHECKS them
    before they are ever accepted — the LLM never hands exec-ready code straight through."""
    variable_order: list[str] = []          # defines y[] index order (symbols)
    parameter_order: list[str] = []         # defines p[] index order (symbols)
    parameter_values: list[_NamedValue] = []
    initial_time: float = 0.0
    final_time: float = 0.0
    calculus: str = "ito"
    variables: list[_VarCode] = []


TRANSFORM_SYSTEM = """You turn a lifted SDE epidemiological model into the EXECUTABLE BioModels curation
model that a diffrax harness runs. For each state variable, write its drift and diffusion right-hand
sides as plain Python EXPRESSIONS over:
  - t        : time (scalar)
  - y[i]     : the state variables, indexed by `variable_order` (0-based)
  - p[j]     : the parameters, indexed by `parameter_order` (0-based)
Only t, y, p and math / jnp / jax functions and arithmetic are allowed — no imports, no other names,
no attribute access except math./jnp./jax. CALL EVERY MATH FUNCTION WITH AN EXPLICIT PREFIX:
jnp.sqrt(...), jnp.exp(...), jnp.log(...), jnp.maximum(...), jnp.sin(...) — NEVER a bare name like
sqrt/exp/max (those are not in scope and will be rejected). Each RHS is ONE expression (it becomes one
entry of the returned list). Honor the calculus convention (Itô unless told otherwise); for demographic/CLE noise
the diffusion entries are typically √rate terms. Give numeric initial_value per variable and numeric
parameter_values; if a value isn't stated, use a reasonable placeholder and keep going. Name the
classification TRANSFORMATIONS you applied in each variable's `steps` (or propose a new name).

Available transformation names:
%s"""


def _known_transform_names() -> set:
    return {t.name for t in _TRANSFORMATIONS}


def build_executable(
    *, model_dump: dict[str, Any], classification: dict[str, Any],
    pdf_url: Optional[str], no_llm: bool = False,
) -> dict[str, Any]:
    """Transform gate: LLM proposes per-variable executable RHS → a SCRIPT assembles drift_code/
    diffusion_code and runs safe_code_check BEFORE accepting. Returns the ExecutableModel (only if it
    passes the safety guard), the recorded term-transforms, and honest safe/reasons. Never runs the
    model and never sets a reproduction verdict — that's the oracle's separate, later job."""
    blank = {"executable": None, "safe": False, "wired": False, "reasons": ["not wired"], "term_transforms": []}
    if no_llm or not pdf_url:
        return blank

    from openai import OpenAI  # lazy

    from processor import MODEL, _download

    client = OpenAI()
    pdf_path = _download(pdf_url)
    try:
        with open(pdf_path, "rb") as f:
            uploaded = client.files.create(file=f, purpose="user_data")
        drift = {t.get("variable"): (t.get("expression") or {}) for t in model_dump.get("drift_terms", [])}
        diff = {t.get("variable"): (t.get("expression") or {}) for t in model_dump.get("diffusion_terms", [])}
        syms = [v.get("symbol") for v in model_dump.get("variables", [])]
        params = [p.get("symbol") for p in model_dump.get("parameters", [])]
        instr = (
            f"Calculus: {classification.get('calculus_convention', 'ito')}. Variables {syms}; parameters "
            f"{params}. Verbatim drift per variable: "
            f"{ {k: (v.get('value') if isinstance(v, dict) else v) for k, v in drift.items()} }. "
            f"Verbatim diffusion: { {k: (v.get('value') if isinstance(v, dict) else v) for k, v in diff.items()} }. "
            f"Produce the executable curation model."
        )
        resp = client.responses.parse(
            model=MODEL,
            input=[{"role": "system", "content": TRANSFORM_SYSTEM % registry_reference()},
                   {"role": "user", "content": [
                       {"type": "input_file", "file_id": uploaded.id},
                       {"type": "input_text", "text": instr},
                   ]}],
            text_format=ExecutableProposal,
        )
        prop = resp.output_parsed
    finally:
        try:
            os.remove(pdf_path)
        except OSError:
            pass

    # ---- deterministic assembly + safety gate (no LLM past here) ----
    order = prop.variable_order or [v.symbol for v in prop.variables]
    by_sym = {v.symbol: v for v in prop.variables}
    ordered = [by_sym[s] for s in order if s in by_sym]
    if not ordered:
        return {"executable": None, "safe": False, "wired": True, "reasons": ["no variables proposed"], "term_transforms": []}
    n = len(ordered)
    drift_code = "return [" + ", ".join((v.drift_rhs or "0.0") for v in ordered) + "]"
    diffusion_code = "return [" + ", ".join((v.diffusion_rhs or "0.0") for v in ordered) + "]"

    ok_d, why_d = safe_code_check(drift_code, n)
    ok_x, why_x = safe_code_check(diffusion_code, n)
    safe = ok_d and ok_x
    reasons = ([f"drift: {r}" for r in why_d] + [f"diffusion: {r}" for r in why_x]) if not safe else []

    known = _known_transform_names()
    term_transforms: list[dict[str, Any]] = []
    for v in ordered:
        for kind, rhs in (("drift", v.drift_rhs), ("diffusion", v.diffusion_rhs)):
            before = (drift if kind == "drift" else diff).get(v.symbol, {})
            before_q = before.get("value") if isinstance(before, dict) else ""
            term_transforms.append({
                "field_path": f"{kind}:{v.symbol}", "variable": v.symbol,
                "before": before_q, "before_sha256": sha256_text(before_q or ""),
                "after": rhs, "after_sha256": sha256_text(rhs or ""),
                "steps": [{"transformation": s, "is_new": s not in known} for s in v.steps],
            })

    executable = None
    code_sha = ""
    if safe:
        em = ExecutableModel(
            variable_names=order, parameter_names=prop.parameter_order or params,
            initial_values={v.symbol: v.initial_value for v in ordered},
            parameter_values={nv.name: nv.value for nv in prop.parameter_values},
            initial_time=prop.initial_time, final_time=prop.final_time,
            drift_code=drift_code, diffusion_code=diffusion_code,
        )
        code_sha = sha256_text(drift_code + "\n" + diffusion_code)
        em.code_sha256 = code_sha
        executable = em.model_dump()

    return {"executable": executable, "safe": safe, "wired": True, "reasons": reasons,
            "code_sha256": code_sha, "term_transforms": term_transforms}


# ---- the per-variable gate agent (real detect for `terms`; classify + transform are model-level) -

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

    def transform(model_dump, classification):
        return build_executable(model_dump=model_dump, classification=classification,
                                pdf_url=pdf_url, no_llm=no_llm)

    return Agent(detect=detect, validate=validate, classify=classify, transform=transform)
