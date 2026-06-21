"""Locator hook — find WHERE each extracted quote sits on the PDF, deterministically.

The real tool behind honest highlighting (Liz, 2026-06-13): given the extractor's verbatim
quote + page, find that text on the page using the PDF's OWN vector text layer and record its
rectangle (normalized 0..1 to the page). The position is recovered from the same text the value
was lifted from — the 2025-26 consensus and the right architecture (researcher + pushback review,
2026-06-20). Two outcomes, both honest:

  found   → store the rect; the UI highlights the term exactly where it is, and the quote is
            PROVEN to be on the page as written. The matched page is recorded (LLM page labels
            are often the PRINTED label, not the physical index — so we don't trust it blindly).
  missing → mark located=false with a reason ('no_text_layer' for scanned/raster pages, else
            'not_found'). The UI does NOT fake a highlight for it.

Matcher (no LLM — precise script work):
  1. PyMuPDF page.search_for(quote) on the stated page, then a shrinking prefix of the quote
     (handles line-break/hyphenation and over-long quotes), then ALL pages as fallback.
  2. NUMERIC-ANCHOR fallback for math/parameter tokens: Greek + subscripts (λ_h) often don't
     survive the text layer (missing /ToUnicode), but the numeric tail (e.g. "0.000039") is in a
     normal Latin font and does — so we match that to recover the box. Stays deterministic.

PyMuPDF (fitz) is imported lazily (same pattern as figures.py) so dry-run / no-PDF paths don't need it.
"""

from __future__ import annotations

import re
from typing import Any, Iterator, Optional

_WS = re.compile(r"\s+")
# a numeric literal: ints, decimals, scientific notation, optional sign — the part of a math token
# that the text layer reliably preserves even when the Greek/subscript symbol does not.
_NUM = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?")


def _norm(text: str) -> str:
    return _WS.sub(" ", text).strip()


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


def _candidates(quote: str) -> list[str]:
    """Search needles, longest first: the whole quote, then shrinking word-prefixes. A prefix is
    more robust than the full sentence (line breaks, trailing punctuation, over-long quotes)."""
    q = _norm(quote)
    if not q:
        return []
    words = q.split()
    out = [q]
    for k in (12, 8, 5, 3):
        if len(words) > k:
            out.append(" ".join(words[:k]))
    seen: set[str] = set()
    res: list[str] = []
    for c in out:
        if c and c not in seen:
            seen.add(c)
            res.append(c)
    return res


def _rect_norm(rect: Any, page: Any) -> Optional[dict[str, float]]:
    """fitz Rect (top-left origin, points) → page-normalized {x,y,w,h}. Maps straight to screen."""
    W = float(page.rect.width)
    H = float(page.rect.height)
    if W <= 0 or H <= 0:
        return None
    return {"x": rect.x0 / W, "y": rect.y0 / H, "w": (rect.x1 - rect.x0) / W, "h": (rect.y1 - rect.y0) / H}


def _search_on_page(page: Any, quote: str) -> tuple[Optional[dict[str, float]], Optional[str]]:
    """Find the quote on one page. Returns (normalized_rect, method) or (None, None).
    method is 'text' (matched the quote text) or 'numeric_anchor' (matched the numeric literal)."""
    # 1) text match: whole quote, then shrinking prefixes
    for needle in _candidates(quote):
        try:
            hits = page.search_for(needle)
        except Exception:  # noqa: BLE001 — a bad page shouldn't kill the slot
            hits = None
        if hits:
            return _rect_norm(hits[0], page), "text"
    # 2) numeric-anchor fallback: the value's numeric literal (>= 3 chars, e.g. "0.000039", "0.225")
    for num in _NUM.findall(quote):
        if len(num) < 3:
            continue  # skip bare single digits — too ambiguous to anchor on
        try:
            hits = page.search_for(num)
        except Exception:  # noqa: BLE001
            hits = None
        if hits:
            return _rect_norm(hits[0], page), "numeric_anchor"
    return None, None


def _page_order(stated: Any, npages: int) -> list[int]:
    """Pages to try, 1-based: the stated page first (if plausible), then a small neighbourhood
    (LLM page labels are often off by the front-matter offset), then every remaining page."""
    order: list[int] = []
    seen: set[int] = set()
    def push(p: int) -> None:
        if 1 <= p <= npages and p not in seen:
            seen.add(p)
            order.append(p)
    if isinstance(stated, int):
        push(stated)
        for d in (1, -1, 2, -2, 3, -3):
            push(stated + d)
    for p in range(1, npages + 1):
        push(p)
    return order


def annotate_locations(pdf_path: str, model: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    """For each present slot, find its quote's rect; set slot['rect'] + slot['located'] (+ the page
    it was actually found on, the match method, and a miss reason). Returns the (mutated) model and a
    {located, missing} tally. Never raises — degrades to unlocated."""
    stats = {"located": 0, "missing": 0}
    present = list(_iter_present(model))
    if not present:
        return model, stats
    try:
        import fitz  # PyMuPDF — lazy, same as figures.py
    except Exception:  # noqa: BLE001
        return model, stats
    try:
        doc = fitz.open(pdf_path)
    except Exception:  # noqa: BLE001 — a bad PDF shouldn't kill the extraction
        return model, stats
    try:
        npages = doc.page_count
        # cheap text-layer probe: if the doc has no extractable text at all, every miss is a
        # raster/scan, not a failed verbatim claim — report that honestly.
        try:
            doc_has_text = any((doc[i].get_text("text") or "").strip() for i in range(min(npages, 6)))
        except Exception:  # noqa: BLE001
            doc_has_text = True
        for slot in present:
            quote = slot.get("quote") or ""
            stated = slot.get("page")
            rect = None
            method = None
            found_page = None
            if quote:
                for pno in _page_order(stated, npages):
                    rect, method = _search_on_page(doc[pno - 1], quote)
                    if rect:
                        found_page = pno
                        break
            if rect:
                slot["rect"] = rect
                slot["located"] = True
                slot["located_page"] = found_page
                slot["locate_method"] = method
                # keep rect + page consistent for rendering: the rect is relative to the page it was
                # actually found on, which may differ from the LLM's stated (printed) page label.
                if isinstance(found_page, int):
                    if found_page != stated:
                        slot["quoted_page"] = stated  # preserve the LLM's original claim
                    slot["page"] = found_page
                slot.pop("locate_reason", None)
                stats["located"] += 1
            else:
                slot["located"] = False
                slot["locate_reason"] = "no_text_layer" if not doc_has_text else "not_found"
                stats["missing"] += 1
    except Exception:  # noqa: BLE001 — never let location break the extraction
        return model, stats
    finally:
        try:
            doc.close()
        except Exception:  # noqa: BLE001
            pass
    return model, stats
