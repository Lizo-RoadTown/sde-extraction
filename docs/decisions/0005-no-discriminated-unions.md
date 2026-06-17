---
title: "ADR 0005: Plain unions, not discriminated unions"
description: A constraint imposed by OpenAI Structured Outputs.
---

**Status:** Accepted · **Date:** 2026-06-12

## Context

The present/absent `Slot` was modelled as a Pydantic discriminated union
(`Field(discriminator="status")`). A real extraction call failed:
`'oneOf' is not permitted`.

## Decision

Use a **plain `Union`**. Pydantic emits a discriminated union as JSON-schema `oneOf`, which
OpenAI Structured Outputs rejects; a plain union emits `anyOf`, which is accepted. The `status`
literal still distinguishes present from absent.

## Consequences

Any Pydantic model used as an OpenAI response format must avoid discriminated unions. The
present/absent semantics are unchanged. Discovered via a real call — see
`services/extraction/practice_run.py`.
