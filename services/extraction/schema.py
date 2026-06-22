"""Extraction schema for SDE epidemiological models — canon-aligned (revised 2026-06-08).

This file is the SINGLE SOURCE OF TRUTH for the extraction shape. It supersedes the
bare-null v1 (every field `X | None`) and matches the present/absent classifiers that
`extract_sample.py` had inlined. `extract_sample.py` should import from here.

GOVERNING CANON — see Agent Drafts/sde-extraction-approach/2026-06-05-document-architecture-canon.md
  We do NOT constrain the SDE forms. We constrain the DOCUMENT. Every slot is FORCED to
  resolve to exactly one of two answers — `present` (the paper states it) or `absent`
  (it does not) — so a missing piece comes back as an explicit, reasoned absence instead
  of a hallucinated value. The document will press for values as if they must exist
  ("thus we obtain…"); that pressure does not create a value. Absence holds.

APPROVAL STATUS (per Liz, 2026-06-08) — see the alignment gap note dated 2026-06-08:
  LIZ-APPROVED REVISION:
    - the forced present/absent slot (Present | Absent, discriminated)
    - the two-reason absence taxonomy (not_stated + requires_inference; collapsed from four)
    - "transcribe verbatim, never evaluate" for present values
  UNDER REVIEW (drafted, not validated): every other classification below — which slots
    exist, the Layer-2 lineage/SHA-256 design, figure_binding, metadata fields, map
    granularity, and the transformation-step node (not yet modeled).

TESTING STATUS (per Liz, 2026-06-08): no extraction testing done. The design is grounded in
  MANUAL REVIEW OF PAPERS to identify the agent-harness constraints — not in test runs.

OpenAI Structured Outputs notes baked in:
  - Lists of objects, never free-form dicts (strict mode forbids open dicts).
  - The present/absent fork is a discriminated union on `status`, not a nullable field.
"""

from __future__ import annotations

import hashlib
from enum import Enum
from typing import Literal, Union

from pydantic import BaseModel, Field


# ============================================================
# THE FORCED PRESENT/ABSENT SLOT   [LIZ-APPROVED REVISION, 2026-06-08]
# The heart of the canon: every mapped slot is present OR absent — never null,
# never invented. This block is approved; the slots that USE it (further down)
# are still under review.
# ============================================================


class AbsenceReason(str, Enum):
    """Why a slot is absent. Two reasons only (Liz, 2026-06-05 — collapsed from four).

    [LIZ-APPROVED REVISION]
    """

    not_stated = "not_stated"                  # a genuine gap in the document
    requires_inference = "requires_inference"  # only reachable by inventing/deriving -> refused


class Present(BaseModel):
    """A slot the paper EXPLICITLY states. The model quotes; it never computes or evaluates.

    [LIZ-APPROVED REVISION]
    """

    status: Literal["present"]
    value: str   # verbatim as written: "0.017/365", "6.417E-5" — transcribed, never evaluated
    meaning: str  # what it means (meaning on everything)
    quote: str   # exact source text supporting it -> Layer 2 hashes this
    page: int


class Absent(BaseModel):
    """A slot the paper does NOT supply. Carries a reason, never a fabricated value.

    [LIZ-APPROVED REVISION]
    """

    status: Literal["absent"]
    reason: AbsenceReason


# Forced: every slot is present OR absent. Plain Union -> anyOf (OpenAI structured
# outputs rejects oneOf, which discriminator= would emit). [LIZ-APPROVED REVISION]
Slot = Union[Present, Absent]


# ============================================================
# LAYER 1 — EXTRACTION  (what the LLM returns)
#
# The FIGURE is the ANCHOR — the produced outcome. It EXISTS; it is never present/absent.
# Everything the figure REQUIRES to have been produced — the model (drift+diffusion), the
# parameters, the variables, their initial conditions, the time span — is each PRESENT or
# ABSENT against the source, carrying rich MEANING metadata. The figure bounds the search.
# (Design: docs/superpowers/specs/2026-06-12-figure-anchored-schema.md)
# ============================================================


class Variable(BaseModel):
    """A state variable the figure's model requires (e.g. 'S', 'I', 'x').

    `symbol` is the anchor (known from what the figure needs). What it MEANS and its INITIAL
    CONDITION are searched for in the source — each present or absent.
    """

    symbol: str                                       # e.g. "S" — the anchor
    meaning: Slot                                     # what it represents (susceptible cells, the OU log-process…)
    initial_value: Slot                               # its initial condition (curation template: initial_values)


class Parameter(BaseModel):
    """A named constant the figure's model requires (e.g. 'mu', 'sigma', 'x_bar').

    `value` and `meaning` are each searched for — present or absent. The Dengue OU review's
    `x_bar` is the canonical absent: 'never stated explicitly' -> Absent(requires_inference).
    """

    symbol: str                                       # e.g. "sigma" — the anchor
    value: Slot                                       # its numeric value (curation template: parameter_values)
    meaning: Slot                                     # what it represents (noise intensity, transmission rate…)
    units: Slot                                       # its units, if stated


class Term(BaseModel):
    """One drift or diffusion contribution for a single variable — the stochastic MODEL itself.

    `expression` is the verbatim right-hand side as written, or absent. The drift terms are the
    deterministic skeleton; the diffusion terms are the noise that makes it stochastic.
    """

    variable: str                                     # which variable this change-term is for
    expression: Slot                                  # the verbatim RHS, present or absent


class TimeSpan(BaseModel):
    """The simulation window the figure was produced over (curation template: initial/final_time)."""

    initial_time: Slot
    final_time: Slot


class FigureRead(BaseModel):
    """The figure as the ANCHOR, read FIRST (its own sub-agent). Identity + the CHECKLIST of
    panels (each subplot's plotted variable). The checklist drives one extractor per variable
    and the completeness cross-check, so a 5-panel figure with only 3 captured vars is FLAGGED.
    [stage: figure reader]
    """

    figure_label: str
    figure_type: str
    outcome: str
    pathogen: str
    panels: list[str]   # the variable plotted in each panel, in order: ["x(t)","I(t)","y(t)","v(t)","w(t)"]
    # The FULL coupled state of the SDE behind the figure — a SUPERSET of panels. A figure may plot
    # only I_h while its equation also needs the (unplotted) coupled variables (S_h, I_v, …). Capturing
    # the whole state is what makes the assembled model CLOSED and runnable; panels stays "what's plotted".
    state_variables: list[str] = []
    time_span: "TimeSpan"


class VariableExtraction(BaseModel):
    """ONE state variable's SDE machinery, extracted by its own focused sub-agent (focused =
    complete). The parameters are those appearing in THIS variable's equation; a script
    reconciles them across variables into the system's parameter set. [stage: variable extractor]
    """

    symbol: str          # the variable this is for (from the checklist), e.g. "x"
    meaning: Slot
    initial_value: Slot
    drift: Slot          # the deterministic RHS for d{symbol} = ( … ) dt
    diffusion: Slot      # the noise RHS: … dW
    parameters: list[Parameter]  # constants appearing in this variable's equation


class FigureExtraction(BaseModel):
    """One (paper, figure) extraction — the unit of work and the OpenAI response_format.

    The figure is the ANCHOR (its fields below are NOT Slots — the figure exists). The MODEL it
    required (drift+diffusion), the PARAMETERS, the VARIABLES (+initial conditions), and the TIME
    SPAN are each present/absent. Per-figure-type specialization (which lists are mandatory) is
    driven by figure_types.required_to_produce; v1 uses this one shape + a profile-guided prompt.
    """

    # --- the FIGURE: the anchor. NOT present/absent — it is the produced outcome. ---
    figure_label: str                                 # 'Figure 2' — which figure
    figure_type: str                                  # the classified outcome type (drives the search)
    outcome: str                                      # 'successful' | 'failed' (could it be reproduced?)
    pathogen: str                                     # context

    # --- what the figure REQUIRED to be produced: each present/absent, with meaning ---
    variables: list[Variable]                         # the compartments/state (+ meaning + initial condition)
    parameters: list[Parameter]                       # the constants (+ value + meaning + units)
    drift_terms: list[Term]                           # the deterministic part of the model
    diffusion_terms: list[Term]                       # the stochastic/noise part of the model
    time_span: TimeSpan                               # the simulation window


# ============================================================
# LAYER 2 — LINEAGE  (filled by our code, never the LLM)
# [UNDER REVIEW] — provenance + tamper-evident hashes. Design carried over from v1; not validated.
# ============================================================


class Provenance(BaseModel):
    """Document-level identity. Computed at ingest, before extraction.  [UNDER REVIEW]"""

    file_sha256: str   # fingerprint of the exact PDF bytes
    doc_root_sha256: str  # hash of the canonical text layer
    parser_id: str     # parser name + version — the determinism guarantee
    page_count: int | None = None


class SpanProof(BaseModel):
    """Tamper-evident proof for one PRESENT slot, computed from its quote.  [UNDER REVIEW]

    `field_path` ties the proof back to the slot it verifies, e.g.
    "parameters[5].value" or "drift_terms[1].expression". Absent slots have nothing to
    hash — that is the point.
    """

    field_path: str
    page: int | None = None
    offset: int | None = None     # char offset into the page's canonical text
    length: int | None = None
    span_sha256: str | None = None  # SHA-256 of the exact span
    verified: bool = False        # did re-hashing the span match?


class VerifiedExtraction(BaseModel):
    """What gets stored: the extraction + its provenance + per-slot proofs.  [UNDER REVIEW]

    The machine verifier fills `span_proofs` and may flip slots to verified before a
    human ever sees them; the human verifier reviews the `model` (the HITL queue).
    """

    provenance: Provenance
    model: FigureExtraction
    span_proofs: list[SpanProof] = Field(default_factory=list)


# ============================================================
# LINEAGE HELPER — code hashes the present slots' quotes (the model never hashes).
# [UNDER REVIEW]
# ============================================================


def checksums_for(model: FigureExtraction) -> dict[str, str]:
    """SHA-256 every PRESENT slot's quote. Returns {field_path: sha256}.

    Absent slots contribute nothing — by design.  [UNDER REVIEW]
    """

    proofs: dict[str, str] = {}

    def hash_slot(path: str, slot: Slot) -> None:
        if isinstance(slot, Present):
            proofs[path] = hashlib.sha256(slot.quote.encode("utf-8")).hexdigest()

    for i, p in enumerate(model.parameters):
        hash_slot(f"parameters[{i}].value", p.value)
        hash_slot(f"parameters[{i}].meaning", p.meaning)
        hash_slot(f"parameters[{i}].units", p.units)
    for i, v in enumerate(model.variables):
        hash_slot(f"variables[{i}].initial_value", v.initial_value)
        hash_slot(f"variables[{i}].meaning", v.meaning)
    for i, e in enumerate(model.drift_terms):
        hash_slot(f"drift_terms[{i}].expression", e.expression)
    for i, e in enumerate(model.diffusion_terms):
        hash_slot(f"diffusion_terms[{i}].expression", e.expression)
    hash_slot("time_span.initial_time", model.time_span.initial_time)
    hash_slot("time_span.final_time", model.time_span.final_time)
    return proofs
