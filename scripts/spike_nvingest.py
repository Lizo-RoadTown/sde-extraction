#!/usr/bin/env python3
"""SPIKE (dev-tooling, NOT runtime): does the NVIDIA page-elements detector separate panels?

Direct REST call to the hosted page-elements NIM — NO nemo-retriever package, NO ray (which
won't install on this Python 3.13 / Windows box). We rasterize each PDF page to an image
ourselves (PyMuPDF) and POST it to the detector, which returns layout regions with bounding
boxes: title / paragraph / table / chart / header_footer.

The question it answers: on the figure's page, does the detector return EACH panel as its own
'chart' box, or lump the multi-panel figure into one? That's the 'captured 3 of 5 panels'
problem (our caption-regex detector, apps/dashboard/src/figures.ts, does it weakly).

Boundaries (unchanged):
  - Detector ONLY. No embedding, no vector DB, no LLM. OpenAI + Pydantic stays the brain
    (services/extraction/processor.py). If this wins, it feeds FigureRead.panels (seam S6) and
    its bounding boxes could also strengthen the locator.
  - Rasterizing (render page -> image) is the robust front-end: the model sees what a human
    sees. Reusable for the OpenAI brain too (cropped sub-figure image -> OpenAI vision).
  - Reads the read-only AT3_review ground-truth PDF; never modifies it.
  - Needs the NVIDIA key (NVIDIA_API_KEY or the alias NVIDIA_KEY, incl. from .env). Never printed.

Usage:
    pip install -r scripts/requirements-spike.txt
    python scripts/spike_nvingest.py [path/to.pdf] [--page N]   # default: all pages, capped

Annotated images (boxes drawn) are written to scripts/out/ so you can SEE the detection.
"""
from __future__ import annotations

import base64
import io
import os
import sys
from collections import Counter
from pathlib import Path

ENDPOINT = os.environ.get(
    "NVI_PAGE_ELEMENTS_URL", "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-page-elements-v3")
# Inline base64 has a request-size ceiling on ai.api.nvidia.com (~180 KB of image). We JPEG-encode
# and downscale to fit; above that NVIDIA requires their asset-upload API (not done in this spike).
MAX_IMAGE_BYTES = int(os.environ.get("NVI_MAX_IMAGE_BYTES", "180000"))
PAGE_CAP = int(os.environ.get("NVI_PAGE_CAP", "16"))  # don't fire unlimited API calls by accident
OUT_DIR = Path("scripts/out")

DEFAULT_PDF = Path(
    "AT3_review/reviews/completed/10_1007s00332.023_copy/Dengue Infection OrnsteinUhlenbeck.pdf")


def _load_key() -> None:
    """Make NVIDIA_API_KEY available from env or .env. Accepts the alias NVIDIA_KEY.
    Only ever reads/sets the NVIDIA key — never loads or echoes other secrets."""
    if os.environ.get("NVIDIA_API_KEY"):
        return
    if os.environ.get("NVIDIA_KEY"):
        os.environ["NVIDIA_API_KEY"] = os.environ["NVIDIA_KEY"]
        return
    for env_path in (Path(".env"), Path("services/extraction/.env")):
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line.startswith(("NVIDIA_API_KEY=", "NVIDIA_KEY=")):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    os.environ["NVIDIA_API_KEY"] = val
                    return


def _preflight(pdf: Path) -> str | None:
    _load_key()
    if not os.environ.get("NVIDIA_API_KEY"):
        return ("NVIDIA key not set. Put NVIDIA_KEY=nvapi-... in .env, or:\n"
                "    PowerShell:  $env:NVIDIA_API_KEY = \"nvapi-...\"")
    if not pdf.exists():
        return f"PDF not found: {pdf}"
    for mod in ("fitz", "requests", "PIL"):
        try:
            __import__(mod)
        except ImportError:
            return ("missing dependency — install the spike deps:\n"
                    "    pip install -r scripts/requirements-spike.txt")
    return None


def rasterize(pdf: Path, page_index: int) -> tuple[bytes, int, int]:
    """Render one PDF page to JPEG bytes, downscaling/quality-reducing to fit MAX_IMAGE_BYTES.
    Returns (jpeg_bytes, width, height)."""
    import fitz  # PyMuPDF
    from PIL import Image

    doc = fitz.open(pdf)
    try:
        page = doc[page_index]
        for dpi in (200, 150, 110, 80):  # step down until the encoded image fits
            pix = page.get_pixmap(dpi=dpi)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            for quality in (85, 70, 55):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=quality)
                data = buf.getvalue()
                if len(data) <= MAX_IMAGE_BYTES:
                    return data, pix.width, pix.height
        # smallest attempt, even if over budget (the POST may then 413 — we report it)
        return data, pix.width, pix.height
    finally:
        doc.close()


def detect(jpeg: bytes) -> dict:
    """POST one image to the page-elements NIM, return parsed JSON."""
    import requests

    b64 = base64.b64encode(jpeg).decode()
    resp = requests.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {os.environ['NVIDIA_API_KEY']}",
                 "Accept": "application/json"},
        json={"input": [{"type": "image_url", "url": f"data:image/jpeg;base64,{b64}"}]},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def boxes_from(response: dict) -> dict[str, list[dict]]:
    """Pull {class: [box,...]} out of the response, tolerant of schema shape."""
    data = response.get("data") or []
    if not data:
        return {}
    bb = (data[0] or {}).get("bounding_boxes") or {}
    return {k: v for k, v in bb.items() if isinstance(v, list)}


def annotate(jpeg: bytes, boxes: dict[str, list[dict]], out_path: Path) -> None:
    """Draw the detected boxes (normalized coords) on the image and save it."""
    from PIL import Image, ImageDraw

    img = Image.open(io.BytesIO(jpeg)).convert("RGB")
    W, H = img.size
    draw = ImageDraw.Draw(img)
    palette = {"chart": (220, 50, 50), "table": (50, 120, 220), "title": (40, 160, 80),
               "paragraph": (150, 150, 150), "header_footer": (200, 160, 40)}
    for cls, items in boxes.items():
        color = palette.get(cls, (255, 0, 255))
        for b in items:
            x0, y0 = b.get("x_min", 0) * W, b.get("y_min", 0) * H
            x1, y1 = b.get("x_max", 0) * W, b.get("y_max", 0) * H
            draw.rectangle([x0, y0, x1, y1], outline=color, width=3)
            draw.text((x0 + 2, y0 + 2), cls, fill=color)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)


def run(pdf: Path, only_page: int | None) -> int:
    import fitz

    doc = fitz.open(pdf)
    n_pages = doc.page_count
    doc.close()

    pages = [only_page] if only_page is not None else list(range(min(n_pages, PAGE_CAP)))
    print(f"page-elements spike · {pdf.name} · {n_pages} pages, scanning {len(pages)}")
    print("detector only — OpenAI stays the brain. Annotated images -> scripts/out/\n")

    totals: Counter[str] = Counter()
    for pidx in pages:
        try:
            jpeg, w, h = rasterize(pdf, pidx)
            response = detect(jpeg)
        except Exception as e:  # noqa: BLE001 — spike: report and continue
            print(f"page {pidx + 1:>2}: ERROR {type(e).__name__}: {str(e)[:120]}")
            continue
        boxes = boxes_from(response)
        counts = {cls: len(v) for cls, v in boxes.items() if v}
        for cls, n in counts.items():
            totals[cls] += n
        out = OUT_DIR / f"{pdf.stem}.p{pidx + 1:02d}.jpg"
        annotate(jpeg, boxes, out)
        summary = ", ".join(f"{cls}:{n}" for cls, n in sorted(counts.items())) or "(nothing)"
        print(f"page {pidx + 1:>2}: {summary}")

    print(f"\ntotals across scanned pages: {dict(totals)}")
    print("\nThe panel question: on the figure's page, is each panel its own 'chart' box,")
    print("or one big 'chart'? Open the annotated scripts/out/*.jpg to see the boxes.")
    return 0


def main() -> int:
    args = [a for a in sys.argv[1:]]
    only_page = None
    if "--page" in args:
        i = args.index("--page")
        only_page = int(args[i + 1]) - 1  # 1-based on the CLI
        del args[i:i + 2]
    pdf = Path(args[0]) if args else DEFAULT_PDF

    err = _preflight(pdf)
    if err:
        print("spike not run — " + err)
        return 0
    return run(pdf, only_page)


if __name__ == "__main__":
    raise SystemExit(main())
