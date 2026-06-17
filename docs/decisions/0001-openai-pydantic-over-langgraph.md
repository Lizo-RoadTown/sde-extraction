---
title: "ADR 0001: OpenAI + Pydantic, not LangGraph"
description: Choosing the extraction stack.
---

**Status:** Accepted · **Date:** 2026-06-12

## Context

The proven prior art (the proves library) used Anthropic + LangGraph with a FRAMES ontology.
This project needed an extractor for SDE epidemiological models.

## Decision

Use **OpenAI Structured Outputs + Pydantic** as the extraction brain. Reuse the prior art's
*wiring* pattern (a Docker poll-worker against a Supabase queue) but not its agent internals.

## Consequences

The present/absent canon is expressed directly as a Pydantic schema used as the model's
response format — the model is forced to return conforming data. We do not adopt LangGraph or
the FRAMES ontology. The schema must obey OpenAI's structured-output constraints (see ADR 0005).

## Revisited — 2026-06-13

The **brain** decision stands: OpenAI structured outputs + Pydantic, deterministic, no FRAMES
ontology, no autonomous planner. What is being revisited is the **orchestration**. To make
extraction *complete* (one subagent per figure-panel variable) and *verified before storage* (a
second-model audit), the single OpenAI call is being decomposed into a **near-decomposable graph**
of OpenAI-backed subagents — an explicit LangGraph `StateGraph` with a Postgres checkpointer for
crash-resume, with the planner / filesystem / summarization middleware **off**.

This is not a reversal: LangGraph returns only as deterministic wiring (the same poll-worker
philosophy applied to multiple stages), never as an autonomous agent framework. The direction is
not yet deployed; see
[`docs/proposals/2026-06-12-command-driven-hooked-pipeline.md`](https://github.com/Lizo-RoadTown/SDE_Extraction)
and [the pipeline reference](/reference/pipeline/). A superseding ADR will be written once the
graph cuts over in production.
