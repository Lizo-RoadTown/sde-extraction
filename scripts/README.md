# scripts/ — dev-tooling

One-off probes and evaluation harnesses. **Not runtime.** Nothing here is imported by the
worker (`services/extraction/`) or the dashboard (`apps/`); these scripts have their own,
separate dependencies.

## `spike_nvingest.py` — is nv-ingest a better figure detector?

An evaluation probe. Runs NVIDIA NeMo Retriever (nv-ingest) in **detection-only** mode against
one PDF and prints the element inventory it finds (text / table / chart / image / infographic,
per page). The question: **does it cleanly separate a multi-panel figure into its panels?** —
the thing our caption-regex detector ([apps/dashboard/src/figures.ts](../apps/dashboard/src/figures.ts))
does weakly (the "captured 3 of 5 panels" problem).

**What it does and does not touch:**
- Uses nv-ingest **only as a detector**. No embedding, no vector DB, no LLM.
- **OpenAI + Pydantic stays the extraction brain** ([processor.py](../services/extraction/processor.py)).
  If nv-ingest wins on detection, it would feed the figure-panel checklist (`FigureRead.panels`,
  seam S6) — not replace the OpenAI read.
- `nemo-retriever` is a **separate install** ([requirements-spike.txt](requirements-spike.txt)) —
  it never enters the worker image.

**Run it:**
```bash
pip install -r scripts/requirements-spike.txt
export NVIDIA_API_KEY=nvapi-...        # PowerShell: $env:NVIDIA_API_KEY = "nvapi-..."
python scripts/spike_nvingest.py [path/to.pdf]
```
Defaults to the one real ground-truth PDF we have (the Dengue Ornstein–Uhlenbeck paper in the
read-only `AT3_review/` reference; only read, never modified). Safe to run before you have the
key — it explains what's missing and exits cleanly.

**Reading the result:** look at whether each figure panel is its own `chart`/`image` row or
lumped into one. Compare against the figure's known ground-truth panels. Tunables via env:
`NVI_RUN_MODE` (`inprocess` default, or `batch` / `service`), and the `NVI_*_URL` endpoints.
