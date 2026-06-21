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
from schema import FigureRead, TimeSpan


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
