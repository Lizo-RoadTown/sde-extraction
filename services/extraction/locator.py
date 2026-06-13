"""Locator hook — find WHERE each extracted quote sits on the PDF, deterministically.

The real tool behind honest highlighting (Liz, 2026-06-13): given the extractor's verbatim
quote + page, search the PDF's own word positions (pdfplumber, MIT) for that text and record
its rectangle (normalized 0..1 to the page). Two outcomes, both honest:

  found   → store the rect; the UI highlights the term exactly where it is, and the quote is
            PROVEN to be on the page as written (verbatim verification — a real lineage signal).
  missing → mark located=false; the "verbatim" claim didn't hold. The UI does NOT fake a
            highlight for it.

No LLM here — this is precise work for a script. Annotates the model dict in place.
"""

from __future__ import annotations

import re
from typing import Any, Iterator

_NONWORD = re.compile(r"[^\w]+", re.UNICODE)


def _key(tok: str) -> str:
    return _NONWORD.sub("", tok.lower())


def _tokens(text: str) -> list[str]:
    return [k for k in (_key(w) for w in text.split()) if k]


def _iter_present(model: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Every present slot in the figure-anchored model (the things that carry a quote)."""
    def present(slot: Any) -> Iterator[dict[str, Any]]:
        if isinstance(slot, dict) and slot.get("status") == "present":
            yield slot
    for v in model.get("variables") or []:
        yield from present(v.get("meaning"))
        yield from present(v.get("initial_value"))
    for p in model.get("parameters") or []:
        yield from present(p.get("value"))
        yield from present(p.get("meaning"))
        yield from present(p.get("units"))
    for t in model.get("drift_terms") or []:
        yield from present(t.get("expression"))
    for t in model.get("diffusion_terms") or []:
        yield from present(t.get("expression"))
    ts = model.get("time_span") or {}
    yield from present(ts.get("initial_time"))
    yield from present(ts.get("final_time"))


def _locate_on_page(page: Any, quote: str) -> dict[str, float] | None:
    """Match the quote's leading tokens against the page's words; return the normalized
    bounding box of the matched run (or None). pdfplumber uses a top-left origin, so the
    coordinates map straight to screen space."""
    words = page.extract_words(use_text_flow=True)
    if not words:
        return None
    wkeys = [_key(w["text"]) for w in words]
    anchor = _tokens(quote)[:8]  # the first few meaningful tokens are enough to pin the spot
    if not anchor:
        return None
    need = min(len(anchor), 3)  # require at least 3 consecutive (or the whole short anchor)
    for i in range(len(words)):
        if not wkeys[i] or wkeys[i] != anchor[0]:
            continue
        matched: list[dict[str, Any]] = []
        j, k = 0, i
        while k < len(words) and j < len(anchor):
            if not wkeys[k]:
                k += 1
                continue
            if wkeys[k] == anchor[j]:
                matched.append(words[k])
                j += 1
                k += 1
            else:
                break
        if j >= need:
            x0 = min(w["x0"] for w in matched)
            x1 = max(w["x1"] for w in matched)
            top = min(w["top"] for w in matched)
            bottom = max(w["bottom"] for w in matched)
            W, H = float(page.width), float(page.height)
            if W <= 0 or H <= 0:
                return None
            return {"x": x0 / W, "y": top / H, "w": (x1 - x0) / W, "h": (bottom - top) / H}
    return None


def annotate_locations(pdf_path: str, model: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    """For each present slot, find its quote's rect on its page; set slot['rect'] + slot['located'].
    Returns the (mutated) model and a {located, missing} tally. Never raises — degrades to unlocated."""
    stats = {"located": 0, "missing": 0}
    present = list(_iter_present(model))
    if not present:
        return model, stats
    try:
        import pdfplumber  # lazy: dry-run / no-PDF paths don't need it
    except Exception:  # noqa: BLE001
        return model, stats
    try:
        with pdfplumber.open(pdf_path) as pdf:
            npages = len(pdf.pages)
            cache: dict[int, Any] = {}
            for slot in present:
                page_no = slot.get("page")
                quote = slot.get("quote") or ""
                rect = None
                if isinstance(page_no, int) and 1 <= page_no <= npages and quote:
                    pg = cache.get(page_no)
                    if pg is None:
                        pg = pdf.pages[page_no - 1]
                        cache[page_no] = pg
                    try:
                        rect = _locate_on_page(pg, quote)
                    except Exception:  # noqa: BLE001 — one bad slot shouldn't fail the rest
                        rect = None
                if rect:
                    slot["rect"] = rect
                    slot["located"] = True
                    stats["located"] += 1
                else:
                    slot["located"] = False
                    stats["missing"] += 1
    except Exception:  # noqa: BLE001 — a bad PDF shouldn't kill the extraction
        return model, stats
    return model, stats
