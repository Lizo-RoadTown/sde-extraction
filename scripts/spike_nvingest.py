#!/usr/bin/env python3
"""SPIKE (dev-tooling, NOT runtime): does nv-ingest detect figure panels better than us?

This is an evaluation probe, not part of the worker. It runs NVIDIA NeMo Retriever
(nv-ingest) in DETECTION-ONLY mode against one PDF and prints the element inventory it
finds — text / table / chart / image / infographic, per page. The question it answers:

    "Does nv-ingest cleanly separate a multi-panel figure into its panels?"

That is the exact thing our caption-regex detector (apps/dashboard/src/figures.ts) does
weakly — the source of the 'captured 3 of 5 panels' problem. If nv-ingest gives a clean
per-panel inventory, it's worth adopting AS A DETECTOR ONLY: it would feed the figure-panel
checklist (FigureRead.panels, S6), while OpenAI + Pydantic stays the extraction brain
(processor.py). We use NONE of nv-ingest's embedding / vector-DB / LLM layers.

Boundaries this honors:
  - OpenAI + Pydantic remains the brain (memory: openai-pydantic-is-the-brain).
  - nemo-retriever is a SEPARATE install (scripts/requirements-spike.txt) — it never touches
    the worker image / services/extraction/requirements.txt.
  - The default input PDF lives in AT3_review/ (read-only reference) — we only READ it.
  - Hosted NIMs: needs NVIDIA_API_KEY in the env. We never store or print the key.

Usage:
    pip install -r scripts/requirements-spike.txt
    export NVIDIA_API_KEY=nvapi-...          # PowerShell: $env:NVIDIA_API_KEY = "nvapi-..."
    python scripts/spike_nvingest.py [path/to.pdf]

Safe to run before you have the key — it explains what's missing and exits 0.
"""
from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path

# Hosted NIM endpoints (build.nvidia.com) — remote inference, no local GPU. Overridable by env
# in case NVIDIA bumps versions.
PAGE_ELEMENTS_URL = os.environ.get(
    "NVI_PAGE_ELEMENTS_URL", "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-page-elements-v3")
OCR_URL = os.environ.get(
    "NVI_OCR_URL", "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1")
TABLE_STRUCTURE_URL = os.environ.get(
    "NVI_TABLE_STRUCTURE_URL", "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-table-structure-v1")

# run_mode: "inprocess" runs the orchestration locally while calling the hosted NIMs for the
# models — the lightest path with no nv-ingest service to stand up. If this errors, try
# NVI_RUN_MODE=batch or =service (a gateway). Discovering the right one is part of the spike.
RUN_MODE = os.environ.get("NVI_RUN_MODE", "inprocess")

# Default to the one real ground-truth PDF we have (read-only reference; we only read it).
DEFAULT_PDF = Path(
    "AT3_review/reviews/completed/10_1007s00332.023_copy/Dengue Infection OrnsteinUhlenbeck.pdf")


def _preflight(pdf: Path) -> str | None:
    """Return an error string if we can't run, else None."""
    if not os.environ.get("NVIDIA_API_KEY"):
        return ("NVIDIA_API_KEY is not set. Get a key at build.nvidia.com, then:\n"
                "    PowerShell:  $env:NVIDIA_API_KEY = \"nvapi-...\"\n"
                "    bash:        export NVIDIA_API_KEY=nvapi-...")
    if not pdf.exists():
        return f"PDF not found: {pdf}\nPass a path: python scripts/spike_nvingest.py path/to.pdf"
    try:
        import nemo_retriever  # noqa: F401
    except ImportError:
        return ("nemo-retriever is not installed (it's a separate dev dependency, NOT in the "
                "worker image). Install it:\n    pip install -r scripts/requirements-spike.txt")
    return None


def run(pdf: Path) -> int:
    from nemo_retriever import create_ingestor

    print(f"nv-ingest spike · run_mode={RUN_MODE} · {pdf.name}")
    print("detection only — no embedding, no vector DB, no LLM. OpenAI stays the brain.\n")

    ingestor = create_ingestor(run_mode=RUN_MODE)
    ingestor = ingestor.files([str(pdf)]).extract(
        extract_text=True,
        extract_tables=True,
        extract_charts=True,
        extract_infographics=True,
        page_elements_invoke_url=PAGE_ELEMENTS_URL,
        ocr_invoke_url=OCR_URL,
        table_structure_invoke_url=TABLE_STRUCTURE_URL,
    )

    chunks = ingestor.ingest()  # pandas.DataFrame, one row per detected element

    # The DataFrame schema can vary by version; pull fields defensively.
    rows = chunks.to_dict("records") if hasattr(chunks, "to_dict") else list(chunks)
    print(f"detected {len(rows)} elements\n")

    def field(r: dict, *names: str):
        for n in names:
            if n in r and r[n] not in (None, ""):
                return r[n]
        md = r.get("metadata") or {}
        cm = (md.get("content_metadata") or {}) if isinstance(md, dict) else {}
        for n in names:
            if isinstance(cm, dict) and cm.get(n) not in (None, ""):
                return cm[n]
        return None

    by_type: Counter[str] = Counter()
    by_page: Counter[int] = Counter()
    print(f"{'#':>3}  {'page':>4}  {'type':<14}  preview")
    print("-" * 78)
    for i, r in enumerate(rows):
        ctype = str(field(r, "content_type", "document_type") or "?")
        page = field(r, "page_number", "page")
        text = str(field(r, "text", "content") or "").replace("\n", " ")
        by_type[ctype] += 1
        if isinstance(page, int):
            by_page[page] += 1
        print(f"{i:>3}  {str(page):>4}  {ctype:<14}  {text[:48]}")

    print("\nby content_type:", dict(by_type))
    print("by page:        ", dict(sorted(by_page.items())))
    print("\nThe question to eyeball: are the figure's panels each a separate chart/image row,")
    print("or lumped into one? Compare against the known ground-truth panels for this figure.")
    return 0


def main() -> int:
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    err = _preflight(pdf)
    if err:
        print("spike not run — " + err)
        return 0  # not a failure; the spike is just waiting on setup
    try:
        return run(pdf)
    except Exception as e:  # noqa: BLE001 — a spike: surface the error verbatim for diagnosis
        print(f"\nnv-ingest run FAILED: {type(e).__name__}: {e}")
        print("If this is about run_mode or a missing service, try NVI_RUN_MODE=batch or =service,")
        print("or paste this error back and we'll adjust the harness.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
