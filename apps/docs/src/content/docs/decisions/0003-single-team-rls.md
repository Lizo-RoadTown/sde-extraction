---
title: "ADR 0003: Single-team access model"
description: No multi-organization federation.
---

**Status:** Accepted · **Date:** 2026-06-05

## Context

The prior art supported multi-organization federation, per-org attribution, and sharing status.

## Decision

Drop all of it. **Single team**: any authenticated user has full access. Row-level security is
enabled with one permissive policy per table.

## Consequences

Simpler schema and UI (no org switcher). Revisit only if multiple independent teams ever need
isolation.
