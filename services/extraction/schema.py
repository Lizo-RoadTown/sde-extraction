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


# Forced: every slot is present OR absent. Discriminated on `status` for strict mode.
# [LIZ-APPROVED REVISION]
Slot = Union[Present, Absent]


# ============================================================
# LAYER 1 — EXTRACTION  (what the LLM returns)
# [UNDER REVIEW] — which slots exist / how the document-map is shaped is not yet validated.
# ============================================================


class StateVariable(BaseModel):
    """A compartment the model tracks, plus its initial value.  [UNDER REVIEW]"""

    symbol: str                                       # e.g. "S" — part of the document-map
    initial_value: Slot = Field(discriminator="status")


class Parameter(BaseModel):
    """A named constant, plus its value.  [UNDER REVIEW]"""

    symbol: str                                       # e.g. "mu"
    value: Slot = Field(discriminator="status")


class Equation(BaseModel):
    """One drift or diffusion contribution for a single state variable.  [UNDER REVIEW]

    `expression` is the verbatim right-hand side as written, or absent. How the math is
    ultimately encoded is deliberately left open — we keep the paper's own text for now.
    """

    variable: str                                     # which state variable this change-term is for
    expression: Slot = Field(discriminator="status")


class FigureBinding(BaseModel):
    """'Which values produced this figure?' — itself present or absent (often a no).  [UNDER REVIEW]"""

    uses_values: Slot = Field(discriminator="status")


class FigureExtraction(BaseModel):
    """One (paper, figure) extraction — the unit of work and the OpenAI response_format.  [UNDER REVIEW]

    NOTE (canon, UNDER REVIEW): this captures the terms of the final model. The canon also calls for
    nodes representing the document's TRANSFORMATION STEPS (deterministic -> stochastic), with a
    present/absent decision at each step. That transformation-step node is NOT yet modeled here — it is
    the main open piece between this schema and the full canon.
    """

    paper_title: Slot = Field(discriminator="status")
    pathogen: Slot = Field(discriminator="status")
    figure_label: str
    state_variables: list[StateVariable]
    parameters: list[Parameter]
    drift_terms: list[Equation]
    diffusion_terms: list[Equation]
    figure_binding: FigureBinding


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
    for i, v in enumerate(model.state_variables):
        hash_slot(f"state_variables[{i}].initial_value", v.initial_value)
    for i, e in enumerate(model.drift_terms):
        hash_slot(f"drift_terms[{i}].expression", e.expression)
    for i, e in enumerate(model.diffusion_terms):
        hash_slot(f"diffusion_terms[{i}].expression", e.expression)
    return proofs
