# sde-extraction-guard

A guard as a **plugin**, not a script you must remember to run.

## What it does

- **Framing-clarification gate** — a `UserPromptSubmit` hook (`hooks/clarify-gate.mjs`) injects a gate
  on every turn that forces the assistant, *before* it scaffolds/deploys/creates anything, to: restate
  the request in the operator's own words; classify the artifact as `{new system | layer in existing
  app | edit}` (smallest that fits); name the exact existing surface it attaches to and what the user
  sees; and confirm. It exists to catch the recurring drift where a requested *layer/tool* gets upgraded
  into a separate, standalone, deployed *system* (e.g. building a whole separate Dagster app instead of
  layering Dagster into the existing dashboard). The operator should not have to phrase things perfectly
  — this filters for the ambiguity and forces a clarify step.
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
