"""The recorded-transformation machinery (memory: reproduction-transformation-must-be-recorded).

Captures HOW a model is lifted off the page and turned into the executable BioModels curation model that
the diffrax harness reproduces — stage by stage, observable, never a black box. This module defines the
RECORD (the Pydantic shapes only); the worker fills it, runs the curation harness, and emits one
validation_events seam per stage. The verdict is set ONLY after the deterministic same-results check
actually runs (the curation model uses a fixed seed, so the same model reproduces bit-for-bit).

The four recorded stages (each a SEAM):
  1. LIFT      — the verbatim term off the page (schema.Term.expression Slot: quote/page/hash). Already captured.
  2. TRANSFORM — verbatim expression -> executable form, via classified TRANSFORMATIONS, with provenance.
  3. RUN       — the BioModels curation model (diffrax, fixed seed) simulates -> a result hash.
  4. CHECK     — a second run gives the SAME result hash -> reproduced (deterministic).
"""
from __future__ import annotations

import hashlib
from typing import Literal, Optional

from pydantic import BaseModel

import classification as c
from schema import Slot

# The observability seam points this transformation emits (the worker fires a validation_events hook
# at each — the observability spine; nothing here is allowed to be a black box).
SEAM_POINTS = ("lift", "transform", "run", "reproduce_check")

ReproStatus = Literal["not_run", "reproduced", "failed"]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest() if text else ""


class TransformStep(BaseModel):
    """One classified operation applied while lifting a term to executable form. `transformation` is a
    TRANSFORMATIONS name (classification.py) — or a proposed new one routed through the candidate HITL
    track (is_new=True). `detail` records exactly what was done, so the step is auditable, not opaque."""

    transformation: str
    is_new: bool = False
    detail: str = ""


class TermTransform(BaseModel):
    """The recorded lift of ONE drift/diffusion term: verbatim -> executable, every step captured.
    `before` is the verbatim Slot off the page (quote/page); `after` is the executable RHS the curation
    model runs. Both hashed so the transformation is traceable end to end."""

    field_path: str                      # e.g. "drift_terms[1]" — ties back to the extraction
    variable: str                        # which variable this term is for
    before: Slot                         # the verbatim expression off the page (present/absent + quote/page)
    steps: list[TransformStep] = []      # the classified transformations applied, in order
    after: str = ""                      # the executable RHS (Python) for drift_term/diffusion_term
    before_sha256: str = ""
    after_sha256: str = ""

    def steps_valid(self) -> bool:
        """Every step is a known transformation, unless explicitly proposed as new (candidate track)."""
        known = {t.name for t in c.TRANSFORMATIONS}
        return all(s.is_new or s.transformation in known for s in self.steps)


class ExecutableModel(BaseModel):
    """The filled BioModels curation model the diffrax harness runs (mirrors curation-template.ipynb).
    drift_code / diffusion_code are the bodies of drift_term(t,y,p)->list and diffusion_term(t,y,p)->list."""

    variable_names: list[str]
    parameter_names: list[str]
    initial_values: dict[str, float]
    parameter_values: dict[str, float]
    initial_time: float
    final_time: float
    drift_code: str
    diffusion_code: str
    code_sha256: str = ""                 # hash of the executable model (the thing that's run)

    def missing(self) -> dict[str, list[str]]:
        """The curation harness's own checks, recorded up front: ICs/params present for every variable."""
        return {
            "initial_values": [n for n in self.variable_names if n not in self.initial_values],
            "parameter_values": [n for n in self.parameter_names if n not in self.parameter_values],
        }


class ReproductionRecord(BaseModel):
    """The one kept record of the whole transformation + the same-results reproducibility check. The
    verdict (figure_reproduced) is set ONLY after both runs complete: reproduced == it ran AND the two
    runs hash-match. Never asserted from a guess."""

    extraction_id: Optional[str] = None
    term_transforms: list[TermTransform] = []   # how each term was lifted (stage 2, observable)
    model: Optional[ExecutableModel] = None     # the executable curation model (input to stage 3)
    seed: int = 0                               # the fixed seed — why re-runs match (determinism)
    ran_ok: Optional[bool] = None               # did the curation harness run without error? (None = not attempted)
    result_sha256: str = ""                     # hash of the simulation result (first run)
    rerun_sha256: str = ""                      # hash of a second run at the same seed
    figure_reproduced: Optional[bool] = None    # ran-ok AND result_sha256 == rerun_sha256
    status: ReproStatus = "not_run"
    note: str = ""                              # why it failed, if it failed

    def decide(self) -> "ReproductionRecord":
        """Compute the verdict — two parts, both required: the harness RAN without error AND the two
        runs hash-match (same results each time). A run that errored is 'failed', NOT 'not_run' — those
        are different facts and we never collapse them into a guess."""
        if self.ran_ok is False:
            self.status, self.figure_reproduced = "failed", False
        elif not self.result_sha256 or not self.rerun_sha256:
            self.status, self.figure_reproduced = "not_run", None
        elif self.result_sha256 == self.rerun_sha256:
            self.status, self.figure_reproduced = "reproduced", True
        else:
            self.status, self.figure_reproduced = "failed", False
        return self
