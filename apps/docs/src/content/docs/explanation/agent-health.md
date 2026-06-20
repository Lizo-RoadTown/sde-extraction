---
title: How it earns its confidence
description: The parts that do the work, and how a person's review turns into earned confidence over time.
---

The system's confidence is not set by hand. It is **earned** from the record of human reviews. This
page explains how, and what you can see today.

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

## How a review becomes confidence

This is the heart of it. When a person reviews a result and confirms or corrects it, that verdict is
fed back to the part that did the work. It raises or lowers that part's confidence for **that kind of
work**: that kind of variable, that kind of parameter, that kind of figure.

So the confidence you see is the system's real track record on work like the one in front of you, and
it improves with every review. A part that has been confirmed many times on a kind of model is trusted
more there; one that has been corrected often is trusted less, and flagged for closer human attention.

## What is not measured yet

Some signals are honest gaps, marked as such rather than faked: how the Reader's behavior drifts across
versions, its speed, and its error rate. These need extra recording that is not switched on yet. When a
measure is not available, the screen says so plainly.

To see where this fits in the whole process, read [Watch it work](/explanation/observability/).
