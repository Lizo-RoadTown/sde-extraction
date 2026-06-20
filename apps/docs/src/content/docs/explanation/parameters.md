---
title: Parameters
description: What a parameter is, how the system reads its role, and how it decides what to do with each one.
---

A **parameter** is a constant in the model: a rate or a size that does not change over the course of
the simulation, like a transmission rate or a population total. This is different from a **variable**,
which is a quantity that changes over time (like the number of infected people).

## It reads the role, not the letter

For each parameter, the system reads its **role** from what the paper says, not from the symbol used.
The same letter can mean different things in different papers, so the role is what matters: a
transmission rate, a recovery rate, a noise strength, a mean-reversion rate, and so on. The full list
is in [What it recognizes](/explanation/recognizes/), and it grows as new papers come through.

## What it decides to do with each one

Reading the role is only half the job. For every parameter the system also decides **what to do with
it**, and it records that decision:

| Decision | What it means |
|---|---|
| Read it | the paper states a value, so it is lifted with its source (the quote and page) |
| Skip it | the symbol is not actually a model parameter, so it is left out |
| Not stated | the value is not given in the paper, so it is marked absent (never invented) |
| Needs working out | the value would have to be inferred, so it is marked absent and flagged for a person |

That last case is common and important. For example, when a parameter drifts randomly around a
long-run average, papers often state how fast it drifts but not the average itself. The system does
not guess it. It marks it as needing a person, so a reviewer can decide.

The rule throughout: **the system reads the role, it never invents a value.** A value is only recorded
when the paper states it, with the exact source attached.
