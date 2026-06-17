---
title: "ADR 0002: The document-architecture canon"
description: Constrain the document, not the space of models.
---

**Status:** Accepted · **Date:** 2026-06-05

## Context

Asking a model an open question ("what is the diffusion term?") invites hallucination, because
the question presumes an answer exists.

## Decision

Do not constrain the space of valid SDEs. Constrain the **document**: map its structure and
force a **present/absent** decision at every slot. Absence is a first-class, successful result.
The document's rhetorical pressure toward a value does not create one.

## Consequences

Every schema field, prompt, and validator serves this rule. An earlier "constrain the SDE
forms" approach is deprecated. See [the canon](/explanation/canon/).
