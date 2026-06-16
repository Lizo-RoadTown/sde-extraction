"""Job processor — turn one extraction job into a present/absent FigureExtraction.

Wraps the OpenAI + Pydantic extraction (the same shape as extract_sample.py) and
makes it TARGET-AWARE: the job's target.mode (auto / figure / model / whole — the
Intake control) shapes the instruction given to the model. The schema and the canon
rules are the single source of truth in schema.py.

Honest seam: --dry-run (no_llm=True) returns a stub extraction so the worker loop +
DB writes are testable without OpenAI spend.
"""

from __future__ import annotations

import os
import re
import tempfile
import urllib.request
from typing import Any, Optional

from schema import FigureExtraction, checksums_for

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-2024-08-06")

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


def _target_instruction(target: dict[str, Any]) -> str:
    """Turn the job's targeting choice into the user instruction (the Intake modes)."""
    mode = (target or {}).get("mode", "auto")
    if mode == "figure":
        ref = target.get("figure_ref") or "the figure named in the request"
        return f"Extract the SDE model behind {ref} into the schema."
    if mode == "model":
        desc = target.get("model_desc") or "the stochastic model described"
        return f"Find and extract the SDE model matching this description: {desc}. Use the schema."
    if mode == "whole":
        return "Extract every SDE model the paper presents. Use the schema for the primary one."
    # auto
    return "Detect the paper's primary figure and extract the SDE model behind it into the schema."


def _download(url: str) -> str:
    """Fetch the PDF to a temp file (the worker passes a Supabase signed URL)."""
    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    urllib.request.urlretrieve(url, path)  # noqa: S310 — trusted signed URL
    return path


def _stub_extraction(figure_label: str) -> dict[str, Any]:
    """A minimal valid result for --dry-run (no OpenAI call). The figure is the anchor
    (plain fields); the required machinery lists are empty (nothing searched in dry-run)."""
    absent = {"status": "absent", "reason": "not_stated"}
    return {
        "figure_label": figure_label,
        "figure_type": "(dry-run)",
        "outcome": "failed",
        "pathogen": "",
        "variables": [],
        "parameters": [],
        "drift_terms": [],
        "diffusion_terms": [],
        "time_span": {"initial_time": absent, "final_time": absent},
        "_dry_run": True,
    }


def run(
    *,
    pdf_url: Optional[str],
    figure_label: str,
    target: dict[str, Any],
    no_llm: bool = False,
) -> dict[str, Any]:
    """Extract one (paper, figure). Returns a dict: the model + per-slot checksums.

    no_llm=True (dry-run) skips OpenAI and returns a stub — exercises the pipeline
    without spend. Otherwise calls OpenAI Structured Outputs constrained by the schema.
    """
    if no_llm or not pdf_url:
        model = _stub_extraction(figure_label)
        return {"model": model, "checksums": {}}

    from openai import OpenAI  # imported lazily so dry-run needs no openai install

    client = OpenAI()  # reads OPENAI_API_KEY
    pdf_path = _download(pdf_url)
    try:
        with open(pdf_path, "rb") as f:
            uploaded = client.files.create(file=f, purpose="user_data")
        response = client.responses.parse(
            model=MODEL,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": [
                    {"type": "input_file", "file_id": uploaded.id},
                    {"type": "input_text", "text": _target_instruction(target)},
                ]},
            ],
            text_format=FigureExtraction,
        )
        result: FigureExtraction = response.output_parsed
        model = result.model_dump()
        # Locator hook (deterministic): pin each present quote's exact rect on the PDF and
        # verify it's truly verbatim. Annotates the model in place (slot['rect'], slot['located']).
        from locator import annotate_locations
        model, locations = annotate_locations(pdf_path, model)
        return {"model": model, "checksums": checksums_for(result), "locations": locations}
    finally:
        try:
            os.remove(pdf_path)
        except OSError:
            pass
