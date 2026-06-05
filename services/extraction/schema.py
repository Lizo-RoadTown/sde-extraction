"""MVP extraction schema for SDE epidemiological models.

Two layers, kept separate on purpose:

  LAYER 1 — EXTRACTION (LLM-facing): what OpenAI returns under Structured
  Outputs. The model fills these and ONLY these. Every field is nullable so a
  missing piece comes back empty rather than invented (no hallucination). Each
  piece carries a verbatim `quote` + `page` as its evidence — the model points
  at the text; it does NOT compute hashes.

  LAYER 2 — LINEAGE (code-filled): provenance + tamper-evident hashes our
  pipeline computes deterministically from the quotes the model returned. The
  LLM never touches these — that is what keeps them provable and reproducible.

OpenAI Structured Outputs notes baked in:
  - Optional fields are `X | None` (nullable), so an absent piece returns null.
  - Lists of objects, never free-form dicts (strict mode forbids open dicts) —
    this is why initial values live on each variable and values on each
    parameter, instead of the old name-keyed dicts.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ============================================================
# LAYER 1 — EXTRACTION  (what the LLM returns)
# ============================================================


class Evidence(BaseModel):
    """Where a piece came from, as the model reports it.

    The model supplies the verbatim quote and the page. Our pipeline later
    turns `quote` into (offset, length, span hash) — see SpanProof. The model
    never hashes.
    """

    quote: str | None = None  # verbatim text from the PDF supporting this piece
    page: int | None = None  # page the quote appears on


class StateVariable(BaseModel):
    """A compartment the model tracks, plus its initial value (terms 1 + 3)."""

    symbol: str  # e.g. "S"
    meaning: str | None = None  # e.g. "Susceptible humans"
    initial_value: float | None = None
    evidence: Evidence | None = None


class Parameter(BaseModel):
    """A named constant, plus its value (terms 2 + 4)."""

    symbol: str  # e.g. "mu"
    meaning: str | None = None
    value: float | None = None
    evidence: Evidence | None = None


class Equation(BaseModel):
    """One drift or diffusion contribution for a single state variable (terms 6, 7).

    `expression` is the verbatim right-hand side as written in the paper. How we
    ultimately encode the math is deliberately left open — MVP keeps the paper's
    own text.
    """

    variable: str  # which state variable this is the change-term for
    expression: str | None = None
    evidence: Evidence | None = None


class TimeSpan(BaseModel):
    """The span the model runs over (term 5)."""

    initial_time: float | None = None
    final_time: float | None = None
    evidence: Evidence | None = None


class Metadata(BaseModel):
    """Paper-level descriptors (term 9)."""

    title: str | None = None
    pathogen: str | None = None
    doi: str | None = None
    figure: str | None = None
    notes: str | None = None


class ExtractedModel(BaseModel):
    """The full extraction from one paper PDF — the 9 terms. This is the schema
    handed to OpenAI as the response format."""

    metadata: Metadata
    state_variables: list[StateVariable]
    parameters: list[Parameter]
    time_span: TimeSpan
    drift_terms: list[Equation]
    diffusion_terms: list[Equation]


# ============================================================
# LAYER 2 — LINEAGE  (filled by our code, never the LLM)
# ============================================================


class Provenance(BaseModel):
    """Document-level identity. Computed at ingest, before extraction."""

    file_sha256: str  # fingerprint of the exact PDF bytes
    doc_root_sha256: str  # hash of the canonical text layer
    parser_id: str  # parser name + version — the determinism guarantee
    page_count: int | None = None


class SpanProof(BaseModel):
    """Tamper-evident proof for one extracted piece, computed from its quote.

    `field_path` ties the proof back to the piece it verifies, e.g.
    "parameters[5].value" or "drift_terms[1].expression".
    """

    field_path: str
    page: int | None = None
    offset: int | None = None  # char offset into the page's canonical text
    length: int | None = None
    span_sha256: str | None = None  # SHA-256 of the exact span
    verified: bool = False  # did re-hashing the span match?


class VerifiedExtraction(BaseModel):
    """What gets stored: the extraction + its provenance + per-piece proofs.

    The machine verifier fills `span_proofs` and may flip pieces to verified
    before a human ever sees them; the human verifier reviews the `model`.
    """

    provenance: Provenance
    model: ExtractedModel
    span_proofs: list[SpanProof] = Field(default_factory=list)
