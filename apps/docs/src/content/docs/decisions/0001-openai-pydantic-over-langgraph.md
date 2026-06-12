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
