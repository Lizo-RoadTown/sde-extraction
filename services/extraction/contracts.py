"""Stage contracts for the v2 pipeline — Pydantic models that aren't in schema.py.

schema.py stays the single source of truth for the extraction shape (Slot, FigureRead,
VariableExtraction, FigureExtraction, checksums_for). This module adds the contracts the
ORCHESTRATED stages exchange: figure detection/choice, the completeness cross-check, the
locator result (with confidence tiers), the verifier's report, and the full "store it all"
staging record. Pydantic-only — no LLM/LangGraph imports here, so it's safe to import anywhere.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from schema import FigureExtraction, FigureRead, VariableExtraction


class FigureCandidate(BaseModel):
    """One figure found by the deterministic figure-detect script (figures-first)."""

    label: str          # "Figure 2"
    caption: str        # best-effort caption text
    page: int


class FigureChoice(BaseModel):
    """Which figure was chosen, and why — only produced when the command was figure='auto'.
    The stored result records this REAL choice, never the literal 'auto' (commands-not-values)."""

    chosen_label: str
    reason: str


class ChecklistGap(BaseModel):
    """One entry of the figure↔model completeness cross-check (the gate that catches 3-of-5)."""

    symbol: str
    status: Literal["captured", "missing", "extra"]   # missing = figure shows it, model didn't capture it
    note: str = ""


ConfidenceTier = Literal["exact", "normalized", "ambiguous", "not_found"]


class LocatorResult(BaseModel):
    """Per present slot: where its quote sits on the PDF, and how sure we are (deterministic)."""

    field_path: str
    located: bool
    tier: ConfidenceTier
    method: Literal["pdfplumber_text", "vision_equation", "none"] = "none"
    rect: Optional[dict[str, float]] = None   # {x, y, w, h} normalized 0..1


class SlotVerdict(BaseModel):
    """The verifier's judgment on one slot (the second model auditing the extractor)."""

    field_path: str
    verdict: Literal["agree", "disagree", "uncertain"]
    rationale: str = ""


class VerificationReport(BaseModel):
    """The singular smart verifier's output — runs BEFORE storage; the human is still final."""

    verifier_model: str               # identity (agent health); a DIFFERENT model than the extractor
    overall: Literal["pass", "flag"]
    slot_verdicts: list[SlotVerdict] = Field(default_factory=list)
    notes: str = ""


class StagedExtraction(BaseModel):
    """What lands in the staging table — STORE IT ALL each run, so every step is cross-checkable
    and replayable (honesty). Promotion copies `.model` into the verified `extractions` table."""

    figure_candidates: list[FigureCandidate] = Field(default_factory=list)
    figure_choice: Optional[FigureChoice] = None
    figure_read: Optional[FigureRead] = None
    per_variable: list[VariableExtraction] = Field(default_factory=list)
    model: FigureExtraction                      # the reconciled, assembled model
    checksums: dict[str, str] = Field(default_factory=dict)
    gaps: list[ChecklistGap] = Field(default_factory=list)
    locator: list[LocatorResult] = Field(default_factory=list)
    verification: Optional[VerificationReport] = None
    pipeline_version: str = "v2"
