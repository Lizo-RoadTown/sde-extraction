# scripts/ — dev-tooling

One-off probes and evaluation harnesses. **Not runtime.** Nothing here is imported by the
worker (`services/extraction/`) or the dashboard (`apps/`); these scripts have their own,
separate dependencies.

## `spike_nvingest.py` — is NVIDIA's page-elements detector better at finding panels?

An evaluation probe. **Rasterizes** each PDF page to an image (PyMuPDF) and POSTs it directly
to NVIDIA's hosted **page-elements NIM**, which returns layout regions with bounding boxes
(title / paragraph / table / chart / header_footer). The question: **does it return each figure
panel as its own `chart` box, or lump a multi-panel figure into one?** — the thing our
caption-regex detector ([apps/dashboard/src/figures.ts](../apps/dashboard/src/figures.ts)) does
weakly (the "captured 3 of 5 panels" problem).

**Why direct REST, not the package:** the full `nemo-retriever`/nv-ingest package needs Python
3.12 and `ray` (no Windows wheel) — it won't install here. We only want the *detector*, which is
a hosted REST endpoint, so we call it directly. Light deps: PyMuPDF + Pillow + requests.

**What it does and does not touch:**
- Detector **only**. No embedding, no vector DB, no LLM.
- **OpenAI + Pydantic stays the extraction brain** ([processor.py](../services/extraction/processor.py)).
  If this wins, it feeds the figure-panel checklist (`FigureRead.panels`, seam S6), and its
  bounding boxes could also strengthen the locator — it does not replace the OpenAI read.
- `nemo-retriever` is **never installed**; nothing here enters the worker image.

**Run it:**
```bash
pip install -r scripts/requirements-spike.txt
# key: NVIDIA_KEY=nvapi-... in repo-root .env (auto-read), or $env:NVIDIA_API_KEY = "nvapi-..."
python scripts/spike_nvingest.py [path/to.pdf] [--page N]
```
Defaults to the one real ground-truth PDF we have (the Dengue Ornstein–Uhlenbeck paper in the
read-only `AT3_review/` reference; only read, never modified). Safe to run before the key exists
— it explains what's missing and exits cleanly.

**Reading the result:** the console prints per-page counts (`chart:N, table:M, ...`); **open the
annotated `scripts/out/*.jpg`** to see the boxes drawn on the page and judge whether each panel
was found separately. Tunables via env: `NVI_PAGE_CAP`, `NVI_MAX_IMAGE_BYTES`,
`NVI_PAGE_ELEMENTS_URL`.
