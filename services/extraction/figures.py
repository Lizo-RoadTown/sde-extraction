"""Figure isolation + rasterization — deterministic, no LLM (the figure-is-the-constraint canon).

The figure is the ANCHOR of an extraction. Until now the whole PDF was handed to OpenAI, so "the
figure" was ambiguous (a paper has many) — hence figures "coming out as lots of figures." This module
isolates ONE figure region on the page and rasterizes JUST that crop, so the extractor is anchored to a
single, named figure. The PDF still goes along for the body text where the machinery (values/params)
lives; the cropped image only fixes WHICH figure.

Research rules honored (memory pdf-figure-extraction-research / rasterize-for-vision-accuracy):
  - CROP, don't crank DPI — clip to the figure rect, then a modest scale. A whole-page 600-dpi blast is
    worse and bigger than a tight crop at 2x.
  - NEVER let the LLM draw the bounding box — detection is a script (PyMuPDF), fully deterministic.
  - Provenance names origin + box + tool + DUAL SHA-256 (the source PDF and the produced crop), so any
    isolated image is traceable back to the exact rect on the exact page of the exact file.

PyMuPDF (fitz) is imported lazily inside the functions that need it (same pattern as locator.py's
pdfplumber) so the contract + pure helpers stay importable/testable without the dependency. Docling
layout detection is the documented upgrade path when its install constraints are resolved.
"""
from __future__ import annotations

import hashlib
import re
from typing import Optional

from pydantic import BaseModel

# A figure caption: "Fig 2", "Figure 3a", "FIG. 12". The number(+optional letter) is the label key.
CAPTION = re.compile(r"\b(?:fig(?:ure)?\.?)\s*([0-9]{1,3}[a-z]?)\b", re.IGNORECASE)
# A REAL caption block STARTS with the figure label ("Fig. 2. ...", "Figure 3: ..."). Anchoring to
# the block start rejects in-text references ("see Fig 2") so they never become phantom figures.
CAPTION_START = re.compile(r"^\s*(?:fig(?:ure)?\.?)\s*([0-9]{1,3}[a-z]?)\b", re.IGNORECASE)

MAX_SCALE = 4.0   # crop-don't-crank guard: clamp rasterization scale so we never blast DPI
MERGE_GAP = 24.0  # points; embedded-image rects closer than this merge into ONE image region
PANEL_GAP = 14.0  # points; vector strokes within this distance are the SAME panel — larger gaps
                  # between subplots separate them, so a multi-panel figure splits into one
                  # region PER PANEL. The anchor must be ONE graphic (one set of axes/ranges).


class FigureRegion(BaseModel):
    """One detected figure region on a page (PDF points, top-left origin)."""

    page: int                                   # 1-based
    bbox: tuple[float, float, float, float]     # (x0, y0, x1, y1) in PDF points
    bbox_norm: tuple[float, float, float, float]  # same, normalized 0..1 to the page
    label: Optional[str] = None                 # "Figure 2", from the nearest caption
    caption: Optional[str] = None               # the caption text (trimmed)
    area: float = 0.0                           # points^2 — used to pick the primary figure
    source: str = "image"                       # how it was detected: image | vector | image+vector


class FigureProvenance(BaseModel):
    """The traceability record for one isolated+rasterized figure (dual SHA-256)."""

    tool: str                                   # "pymupdf"
    page: int
    bbox: tuple[float, float, float, float]
    bbox_norm: tuple[float, float, float, float]
    scale: float
    label: Optional[str] = None
    caption: Optional[str] = None
    source_sha256: str = ""                     # the source PDF
    image_sha256: str = ""                      # the produced crop (PNG bytes)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def norm_label(label: str) -> str:
    """'Figure 2' / 'fig.2' / 'FIG 2' -> '2' (the comparable key)."""
    m = CAPTION.search(label or "")
    return m.group(1).lower() if m else re.sub(r"[^0-9a-z]", "", (label or "").lower())


# --- deterministic detection (PyMuPDF) --------------------------------------

def _image_rects(page) -> list:
    """Rects of embedded raster images on the page (skip tiny logos/rules)."""
    out = []
    for img in page.get_images(full=True):
        xref = img[0]
        try:
            for r in page.get_image_rects(xref):
                if r.width > 12 and r.height > 12:
                    out.append(r)
        except Exception:  # noqa: BLE001 — one bad image shouldn't drop the page
            continue
    return out


def _near(a, b, gap: float) -> bool:
    import fitz
    return fitz.Rect(a.x0 - gap, a.y0 - gap, a.x1 + gap, a.y1 + gap).intersects(b)


def _merge_rects(rects: list, gap: float = MERGE_GAP) -> list:
    """Union rects that overlap or sit within `gap` — sub-panels become ONE figure region."""
    import fitz
    boxes = [fitz.Rect(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out: list = []
        while boxes:
            b = boxes.pop()
            grew = True
            while grew:
                grew = False
                rest = []
                for o in boxes:
                    if _near(b, o, gap):
                        b = b | o            # union
                        grew = True
                        changed = True
                    else:
                        rest.append(o)
                boxes = rest
            out.append(b)
        boxes = out
    return boxes


def _captions(page) -> list:
    """(label, rect, text) for each text block that STARTS with a figure-caption label. Block-start
    anchoring rejects in-text references ('see Fig 2') so they never become phantom figures."""
    import fitz
    out = []
    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text = block[0], block[1], block[2], block[3], block[4]
        m = CAPTION_START.match(text or "")
        if m:
            out.append((f"Figure {m.group(1)}", fitz.Rect(x0, y0, x1, y1), (text or "").strip()[:200]))
    return out


def _nearest_caption(region, captions):
    """The caption directly below the region (typical) else the closest by center distance.
    Returns (label, text, index) so the caller can mark that caption as claimed by a raster figure."""
    below = [(i, c) for i, c in enumerate(captions)
             if c[1].y0 >= region.y1 - 4 and c[1].x1 > region.x0 and c[1].x0 < region.x1]
    if below:
        i, c = min(below, key=lambda ic: ic[1][1].y0 - region.y1)
        return c[0], c[2], i
    if captions:
        rcx, rcy = (region.x0 + region.x1) / 2, (region.y0 + region.y1) / 2
        i, c = min(enumerate(captions),
                   key=lambda ic: ((ic[1][1].x0 + ic[1][1].x1) / 2 - rcx) ** 2
                   + ((ic[1][1].y0 + ic[1][1].y1) / 2 - rcy) ** 2)
        return c[0], c[2], i
    return None, None, None


def _caption_region(page, crect, captions, drawing_rects):
    """Bound a VECTOR figure by the REAL drawn content above its caption. The caption anchors WHERE a
    figure is; the actual vector drawings give its extent. Returns a fitz.Rect, or None when nothing
    is drawn above the caption (honest 'no figure' — never a fabricated box over body text)."""
    import fitz
    pw = float(page.rect.width)
    # the band above this caption, not crossing another caption above it (that's a different figure)
    above = [c[1].y1 for c in captions if c[1].y1 <= crect.y0 - 2]
    band_top = max(above) if above else 0.0
    band_bottom = crect.y0
    sel = [r for r in drawing_rects
           if band_top <= (r.y0 + r.y1) / 2 <= band_bottom and (r.width >= 1 or r.height >= 1)]
    if not sel:
        return None  # nothing actually drawn above the caption -> don't invent a figure
    u = fitz.Rect(sel[0])
    for r in sel[1:]:
        u |= r
    u = u & fitz.Rect(0, band_top, pw, band_bottom)  # clamp to the band, above the caption text
    if u.is_empty or u.width < 24 or u.height < 24:
        return None
    return u


def _widest_gap(proj, frac: float, min_gutter: int):
    """The widest interior white gutter in an ink projection (a band with <= frac of the max ink,
    >= min_gutter long, content on BOTH sides) — where a compound figure splits. None if none."""
    thresh = max(1.0, float(proj.max()) * frac)
    empty = proj <= thresh
    best = None
    i, n = 0, len(proj)
    while i < n:
        if empty[i]:
            j = i
            while j < n and empty[j]:
                j += 1
            if (j - i) >= min_gutter and i > 0 and j < n and (best is None or (j - i) > best[2]):
                best = (i, j, j - i)
            i = j
        else:
            i += 1
    return best


def _xy_cut(gray, ox, oy, frac, min_gutter, min_split, out, depth=0):
    """Recursive X-Y cut: split along the SINGLE widest white gutter (only when both sides stay
    >= min_split), recurse, and emit each leaf trimmed to its ink. One leaf = one panel (one set of
    axes/ranges). Single-widest-gap (not all-gaps) avoids shredding a panel at minor internal gaps."""
    import numpy as np
    ink = gray < 245
    if not ink.any():
        return
    rg = _widest_gap(ink.sum(axis=1), frac, min_gutter)
    cg = _widest_gap(ink.sum(axis=0), frac, min_gutter)
    cand = []
    if rg and rg[0] >= min_split and (gray.shape[0] - rg[1]) >= min_split:
        cand.append(("r", rg))
    if cg and cg[0] >= min_split and (gray.shape[1] - cg[1]) >= min_split:
        cand.append(("c", cg))
    if depth < 14 and cand:
        axis, gap = max(cand, key=lambda x: x[1][2])
        m = (gap[0] + gap[1]) // 2
        if axis == "r":
            _xy_cut(gray[:m, :], ox, oy, frac, min_gutter, min_split, out, depth + 1)
            _xy_cut(gray[m:, :], ox, oy + m, frac, min_gutter, min_split, out, depth + 1)
        else:
            _xy_cut(gray[:, :m], ox, oy, frac, min_gutter, min_split, out, depth + 1)
            _xy_cut(gray[:, m:], ox + m, oy, frac, min_gutter, min_split, out, depth + 1)
        return
    ys, xs = np.where(ink)  # leaf: trim to the actual ink so the crop hugs the panel
    out.append((ox + int(xs.min()), oy + int(ys.min()), ox + int(xs.max()), oy + int(ys.max())))


def _split_into_panels(page, fig_rect, scale: float = 2.0) -> list:
    """Render the figure region and X-Y-cut it into individual panels. Drops label/legend slivers
    (too small to be a plot). Returns reading-ordered fitz.Rect panels in PDF coords, or [the whole
    region] when it doesn't cleanly split. Projection cut is the lightest splitter — imperfect on
    dense grids; the human sees each crop and picks (PanelSeg is the accuracy upgrade path)."""
    import fitz
    import numpy as np
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=fig_rect, colorspace=fitz.csGRAY)
        gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, :pix.width]
    except Exception:  # noqa: BLE001 — a bad render shouldn't drop the figure
        return [fitz.Rect(fig_rect)]
    boxes: list = []
    _xy_cut(gray, 0, 0, 0.06, int(2 * scale), int(15 * scale), boxes)
    panels = []
    for px0, py0, px1, py1 in boxes:
        if (px1 - px0) / scale >= 50 and (py1 - py0) / scale >= 40:  # a panel is a plot, not a label
            panels.append(fitz.Rect(
                fig_rect.x0 + px0 / scale, fig_rect.y0 + py0 / scale,
                fig_rect.x0 + px1 / scale, fig_rect.y0 + py1 / scale,
            ))
    panels.sort(key=lambda r: (round(r.y0 / 10), r.x0))  # reading order
    return panels or [fitz.Rect(fig_rect)]


def detect_figures(pdf_path: str) -> list[FigureRegion]:
    """Every PANEL in the PDF, surfaced for the human to choose ONE. Figure-level regions come from
    embedded images (raster) or caption-anchored vector drawings; each is then X-Y-cut into its
    individual panels (one set of axes/ranges per panel). No ranking, no auto-pick."""
    import fitz
    regions: list[FigureRegion] = []
    doc = fitz.open(pdf_path)
    try:
        for pno in range(len(doc)):
            page = doc[pno]
            pw, ph = float(page.rect.width), float(page.rect.height)
            if pw <= 0 or ph <= 0:
                continue
            captions = _captions(page)
            # figure-level regions: (rect, label, caption, source)
            figs: list = []
            claimed: set[int] = set()
            for c in _merge_rects(_image_rects(page)):
                label, cap, ci = _nearest_caption(c, captions)
                if ci is not None:
                    claimed.add(ci)
                figs.append((fitz.Rect(c), label, cap, "image"))
            drawing_rects: Optional[list] = None
            for ci, (label, crect, ctext) in enumerate(captions):
                if ci in claimed:
                    continue
                if drawing_rects is None:
                    drawing_rects = [fitz.Rect(d["rect"]) for d in page.get_drawings()]
                u = _caption_region(page, crect, captions, drawing_rects)
                if u is not None:
                    figs.append((u, label, ctext, "vector"))
            # split each figure into its panels — the human picks ONE panel (one set of ranges)
            for fig_rect, label, cap, source in figs:
                panels = _split_into_panels(page, fig_rect)
                multi = len(panels) > 1
                for i, p in enumerate(panels):
                    plabel = f"{label} · {i + 1}" if (multi and label) else label
                    regions.append(FigureRegion(
                        page=pno + 1,
                        bbox=(p.x0, p.y0, p.x1, p.y1),
                        bbox_norm=(p.x0 / pw, p.y0 / ph, p.x1 / pw, p.y1 / ph),
                        label=plabel, caption=cap, area=p.get_area(),
                        source=(source + "+panel") if multi else source,
                    ))
    finally:
        doc.close()
    return regions


def rasterize_region(pdf_path: str, region: FigureRegion, scale: float = 2.0) -> bytes:
    """Rasterize JUST the region's rect to PNG bytes at a clamped scale (crop, don't crank DPI)."""
    import fitz
    scale = max(1.0, min(float(scale), MAX_SCALE))
    doc = fitz.open(pdf_path)
    try:
        page = doc[region.page - 1]
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=fitz.Rect(*region.bbox))
        return pix.tobytes("png")
    finally:
        doc.close()


def detect_serializable(pdf_path: str) -> list[dict]:
    """Detected regions as plain dicts for storage + the human chooser (no LLM, no ranking).
    The chooser renders each region cropped from the PDF to bbox_norm; a pick drives figure-mode
    extraction by label (isolate_figure(label=...) re-finds the same region — one detector, no drift)."""
    return [
        {"label": r.label, "caption": r.caption, "page": r.page,
         "bbox": list(r.bbox), "bbox_norm": list(r.bbox_norm)}
        for r in detect_figures(pdf_path)
    ]


def isolate_figure(pdf_path: str, *, label: Optional[str] = None, scale: float = 2.0) -> Optional[dict]:
    """Isolate ONE figure -> {png, region, provenance}. Picks the label-matched region if `label` is
    given, else the largest-area region (the paper's primary figure). Returns None if none detected."""
    regions = detect_figures(pdf_path)
    if not regions:
        return None
    if label:
        want = norm_label(label)
        cands = [r for r in regions if r.label and norm_label(r.label) == want]
        region = max(cands or regions, key=lambda r: r.area)
    else:
        region = max(regions, key=lambda r: r.area)
    png = rasterize_region(pdf_path, region, scale=scale)
    with open(pdf_path, "rb") as f:
        src_sha = _sha256(f.read())
    prov = FigureProvenance(
        tool="pymupdf", page=region.page, bbox=region.bbox, bbox_norm=region.bbox_norm,
        scale=max(1.0, min(float(scale), MAX_SCALE)), label=region.label, caption=region.caption,
        source_sha256=src_sha, image_sha256=_sha256(png),
    )
    return {"png": png, "region": region, "provenance": prov}


def isolate_region(pdf_path: str, *, page: int, bbox_norm, label: Optional[str] = None,
                   caption: Optional[str] = None, scale: float = 2.0) -> dict:
    """Isolate the EXACT region a human picked (one panel) -> {png, region, provenance}. Anchors by
    bbox, not label: panels share a caption, so the label isn't unique — the human's pick IS the
    truth. bbox_norm is page-normalized (x0, y0, x1, y1)."""
    import fitz
    doc = fitz.open(pdf_path)
    try:
        pg = doc[page - 1]
        pw, ph = float(pg.rect.width), float(pg.rect.height)
    finally:
        doc.close()
    x0, y0, x1, y1 = bbox_norm
    region = FigureRegion(
        page=page, bbox=(x0 * pw, y0 * ph, x1 * pw, y1 * ph), bbox_norm=tuple(bbox_norm),
        label=label, caption=caption, area=(x1 - x0) * pw * (y1 - y0) * ph, source="panel",
    )
    png = rasterize_region(pdf_path, region, scale=scale)
    with open(pdf_path, "rb") as f:
        src_sha = _sha256(f.read())
    prov = FigureProvenance(
        tool="pymupdf", page=page, bbox=region.bbox, bbox_norm=region.bbox_norm,
        scale=max(1.0, min(float(scale), MAX_SCALE)), label=label, caption=caption,
        source_sha256=src_sha, image_sha256=_sha256(png),
    )
    return {"png": png, "region": region, "provenance": prov}
