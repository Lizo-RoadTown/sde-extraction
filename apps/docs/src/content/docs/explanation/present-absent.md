---
title: Present / absent
description: Why every captured fact is forced into one of two states, and why "absent" is a first-class, successful result.
---

Every fact the extractor captures is a **slot**, and every slot resolves to exactly one of
two states. This is the mechanism that makes the [canon](/explanation/canon/) concrete.

## The two states

- **Present** — the paper explicitly states the value. It is transcribed *verbatim*
  (`0.017/365`, `6.417E-5`), never evaluated or simplified, and carries the exact source
  quote and page.
- **Absent** — the paper does not state the value. The slot records an explicit *absent*
  with a reason. It is never null, never a placeholder, never a guess.

## Absence is a result, not a gap

The most important consequence: a correctly-returned *absent* is a **success**. When a paper
presses toward a value it never actually states, the right extraction is *absent* — on
purpose. A system that fabricated a plausible value there would be failing at exactly the
task this method exists to do.

## Why not nullable fields?

An earlier design used nullable fields (`value: float | None`). That is the anti-pattern the
present/absent slot replaces: a `null` cannot distinguish *"the paper states this is absent"*
from *"the extractor skipped it."* The forced present/absent decision removes that ambiguity
— absence is always a deliberate, reasoned answer.

*Source: `services/extraction/schema.py`. See [Reference → Extraction schema](/reference/schema/).*
