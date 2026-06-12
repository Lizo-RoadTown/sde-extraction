---
title: Targeting modes
description: The four ways a user tells the engine what to extract from a paper.
---

When a paper is added, the user chooses how the engine should target what to extract. The
choice rides on the job as a `target` JSONB field and shapes the instruction given to the
model (`services/extraction/processor.py`).

| Mode | The user… | The job carries |
|---|---|---|
| `auto` | lets the engine detect the model and verifies it | `{ "mode": "auto" }` |
| `figure` | names the figure to target | `{ "mode": "figure", "figure_ref": "Figure 2" }` |
| `model` | describes the model to find | `{ "mode": "model", "model_desc": "..." }` |
| `whole` | extracts every model the engine finds | `{ "mode": "whole" }` |

The mode changes only the *instruction* to the model — never the schema or the canon. A
present/absent result is returned regardless of mode.

*Source: `services/extraction/processor.py`, `supabase/migrations/0002_job_target.sql`.*
