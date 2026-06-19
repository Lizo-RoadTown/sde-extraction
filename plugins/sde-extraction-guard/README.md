# sde-extraction-guard

A guard as a **plugin**, not a script you must remember to run.

## What it does

- **Schema guard hook** — after any edit to `services/extraction/*.py` or `scripts/check_schema.py`, a
  `PostToolUse` hook runs the existing schema guard (`scripts/check_schema.py`) automatically. If the
  guard fails (a bad import/name/contract — the class of bug that crash-looped the worker), it blocks
  with the failure surfaced, so a broken schema can't be shipped. The guard *logic* stays in the repo
  (it imports the repo's modules); the plugin just enforces it.
- **`recorded-transformation` skill** — the discipline for building observable, non-black-box data
  transformations (lift → classified transform → real-tool run → deterministic check, every stage
  recorded). Loads when you work on the transformation/reproduction machinery.

## Install (local dev marketplace)

```
/plugin marketplace add ./plugins/sde-extraction-guard
/plugin install sde-extraction-guard@sde-extraction-dev-plugins
```
Then restart Claude Code. The hook fires on the next edit to the extraction surface.

## Why a plugin

Guards in `scripts/` rot or get skipped (you have to remember to run them). A hook-enforced plugin runs
the guard every time, automatically — the loom-discipline pattern, applied to this repo's schema.
