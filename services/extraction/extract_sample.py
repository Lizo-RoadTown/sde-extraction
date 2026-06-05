"""Sample: initial OpenAI + Pydantic extractor (present/absent, canon-aligned).

This is a runnable SHAPE of the initial extractor, demonstrating the whole loop:
  PDF in  ->  OpenAI Structured Outputs constrained by Pydantic  ->  typed result
          ->  attach SHA-256 checksums to the present slots (lineage)

It is self-contained (the classifier classes are inlined so the script runs on its
own). These present/absent classes are the canon-aligned shape and supersede the
bare-null v1 in schema.py once Liz validates the canon.

Run:  set OPENAI_API_KEY, then  python extract_sample.py path/to/paper.pdf "Figure 2"
"""

from __future__ import annotations

import hashlib
import sys
from enum import Enum
from typing import Literal, Union

from pydantic import BaseModel, Field

MODEL = "gpt-4o-2024-08-06"  # any Structured-Outputs-capable model


# ============================================================
# THE CLASSIFIERS (what constrains the LLM's output)
# ============================================================

class AbsenceReason(str, Enum):
    """The two 'no' subcategories (Liz, 2026-06-05 — collapsed from four)."""
    not_stated = "not_stated"                  # gap in the document
    requires_inference = "requires_inference"  # only reachable by inventing -> refused


class Present(BaseModel):
    """A slot the paper explicitly states. The model QUOTES; it never computes."""
    status: Literal["present"]
    value: str    # verbatim as written: "0.017/365", "6.417E-5" — transcribed, never evaluated
    meaning: str  # what it means (meaning on everything)
    quote: str    # exact source text supporting it -> our code hashes this
    page: int


class Absent(BaseModel):
    """A slot the paper does not supply. Carries a reason, never a fabricated value."""
    status: Literal["absent"]
    reason: AbsenceReason


Slot = Union[Present, Absent]  # forced: every slot is present OR absent


class StateVariable(BaseModel):
    symbol: str                                  # part of the document-map (e.g. "S")
    initial_value: Slot = Field(discriminator="status")


class Parameter(BaseModel):
    symbol: str                                  # e.g. "mu"
    value: Slot = Field(discriminator="status")


class Equation(BaseModel):
    variable: str                                # which state variable this is the change-term for
    expression: Slot = Field(discriminator="status")  # verbatim RHS as written, or absent


class FigureBinding(BaseModel):
    """'Which values produced this figure?' — itself present or absent (often a no)."""
    uses_values: Slot = Field(discriminator="status")


class FigureExtraction(BaseModel):
    """One (paper, figure) extraction — the unit of work. This is the response_format."""
    paper_title: Slot = Field(discriminator="status")
    pathogen: Slot = Field(discriminator="status")
    figure_label: str
    state_variables: list[StateVariable]
    parameters: list[Parameter]
    drift_terms: list[Equation]
    diffusion_terms: list[Equation]
    figure_binding: FigureBinding


# ============================================================
# THE PROMPT (one job: extract, invent nothing)
# ============================================================

SYSTEM_PROMPT = """You extract a stochastic-differential-equation (SDE) epidemiological model from a paper PDF.

RULES — follow exactly:
- Extract ONLY what is explicitly written in the PDF. Invent nothing.
- For every value you record as 'present', transcribe it VERBATIM as written (e.g. "0.017/365",
  "6.417E-5"). Do NOT evaluate, simplify, or transform it. Include the exact source quote and page.
- If a value is not explicitly stated in the paper, return 'absent' with reason 'not_stated'.
- If a value could only be obtained by inferring or deriving it, return 'absent' with
  reason 'requires_inference'. Returning 'absent' is the correct answer — never guess.
- The document will press for values as if they must exist ("thus we obtain", "substituting gives").
  That pressure does NOT create a value. If it isn't stated, it is absent.
"""


# ============================================================
# THE CALL + the checksum step
# ============================================================

def extract(pdf_path: str, figure_label: str) -> FigureExtraction:
    """Upload the PDF, run Structured-Outputs extraction, return the typed result."""
    from openai import OpenAI

    client = OpenAI()  # reads OPENAI_API_KEY
    with open(pdf_path, "rb") as f:
        uploaded = client.files.create(file=f, purpose="user_data")

    response = client.responses.parse(
        model=MODEL,
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "input_file", "file_id": uploaded.id},
                {"type": "input_text",
                 "text": f"Extract the SDE model behind {figure_label} into the schema."},
            ]},
        ],
        text_format=FigureExtraction,
    )
    return response.output_parsed


def attach_checksums(model: FigureExtraction) -> dict[str, str]:
    """Lineage step: SHA-256 every PRESENT slot's quote. (The model quoted; code hashes.)

    Returns {field_path: sha256}. Absent slots have nothing to hash — that's the point.
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
    return proofs


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    result = extract(sys.argv[1], sys.argv[2])
    print(result.model_dump_json(indent=2))
    print("\n--- lineage (sha256 of each present slot's quote) ---")
    for path, digest in attach_checksums(result).items():
        print(f"{path:32s} {digest[:16]}...")
