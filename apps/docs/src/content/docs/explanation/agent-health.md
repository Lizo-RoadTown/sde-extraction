---
title: How it earns its confidence
description: The parts that do the work, and how a person's review turns into earned confidence over time.
---

The intended design is that the system's confidence is not set by hand — it is **earned** from the
record of human reviews. This page explains that intended mechanism, and is clear about what actually
runs today (the Reader's real counts) versus what is still planned (the feedback-into-confidence loop).

## The parts that do the work

The work is shared by a few parts, each with a clear job:

| Part | Job |
|---|---|
| Reader | reads the model behind the chosen figure into the structured form |
| Router | routes a paper through the steps and hands work to the others |
| Checker | re-checks the reading before it reaches a person |
| Keeper | stores the result, and keeps it once a person approves |

Today **only the Reader is running.** You can see its real numbers on the **Agent Health** screen: how
many papers it has processed, how many succeeded or failed, how many are waiting for a person, and how
many a person has since confirmed. The Router, Checker, and Keeper are being built; on screen they are
clearly marked as planned, never shown with made-up numbers.

## How a review becomes confidence _(planned)_

:::note[Planned — not built yet]
This is the intended mechanism. The human verdicts are recorded today, but nothing yet reads them back
into a per-type confidence score; that loop is not implemented.
:::

The intended heart of it: when a person reviews a result and confirms or corrects it, that verdict
would be fed back to the part that did the work, raising or lowering its confidence for **that kind of
work** — that kind of variable, that kind of parameter, that kind of figure.

The aim is that the confidence reflects a real track record on work like the one in front of you, and
improves with every review: a part confirmed many times on a kind of model is trusted more there; one
corrected often is trusted less and flagged for closer human attention. (Today the dashboard shows
real **completeness** instead — see [How sure it is](/explanation/confidence/).)

## What is not measured yet

Some signals are honest gaps, marked as such rather than faked: how the Reader's behavior drifts across
versions, its speed, and its error rate. These need extra recording that is not switched on yet. When a
measure is not available, the screen says so plainly.

To see where this fits in the whole process, read [Watch it work](/explanation/observability/).
