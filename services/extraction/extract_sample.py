"""Sample: initial OpenAI + Pydantic extractor (present/absent, canon-aligned).

This is a runnable SHAPE of the initial extractor, demonstrating the whole loop:
  PDF in  ->  OpenAI Structured Outputs constrained by Pydantic  ->  typed result
          ->  attach SHA-256 checksums to the present slots (lineage)

The schema classes now live in schema.py (the single source of truth, revised
2026-06-08 to this canon-aligned present/absent shape). This script imports them
rather than redefining them.

Run:  set OPENAI_API_KEY, then  python extract_sample.py path/to/paper.pdf "Figure 2"
"""

from __future__ import annotations

import sys

from schema import FigureExtraction, checksums_for  # single source of truth (canon-aligned shape)

MODEL = "gpt-4o-2024-08-06"  # any Structured-Outputs-capable model


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


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    result = extract(sys.argv[1], sys.argv[2])
    print(result.model_dump_json(indent=2))
    print("\n--- lineage (sha256 of each present slot's quote) ---")
    for path, digest in checksums_for(result).items():
        print(f"{path:32s} {digest[:16]}...")
