---
title: The two run paths
description: On the Walkthrough you choose how a paper is run. Both paths read the model with the same brain; only the orchestration around it differs.
---

When you add a paper on the Walkthrough, you first choose **how it runs**. There are two options. They
extract the **same model with the same brain** (OpenAI + Pydantic) and produce the **same kind of
result** — the difference is the machinery *around* the extraction, not the extraction itself.

## OpenAI / Pydantic

A single call reads the model behind the figure. No workflow wraps the steps — it is the most direct
path. Choose this when you want a straightforward run.

## Dagster + OpenAI / Pydantic

The **same** extraction, but run as an orchestrated workflow: the steps run in order as observable,
retriable stages, so you can watch each part and a failed step can retry on its own without losing the
others' work. Choose this when you want the run broken into visible, checkable steps.

## What's the same, what's different

| | OpenAI / Pydantic | Dagster + OpenAI / Pydantic |
|---|---|---|
| The extraction brain | OpenAI + Pydantic | OpenAI + Pydantic (identical) |
| The result | same present/absent model | same present/absent model |
| Orchestration | one call, no workflow | ordered, observable, retriable steps |
| Where its data lives | its own store | a separate store |

Because each path keeps its **own** data, a paper you run on one path appears under that path — they
don't mix. You pick the path on the Walkthrough before uploading; there is no separate setting elsewhere.

## Which to pick

Either gives the same answer. Pick **OpenAI / Pydantic** for a quick, direct run; pick **Dagster +
OpenAI / Pydantic** when you want to see the run as separate steps and have failed steps retry on their
own. You can run some papers each way and compare.

See the run itself in [Watch it work](/explanation/observability/).
