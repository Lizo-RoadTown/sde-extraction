---
title: The structured map
description: A fixed list of every part a model of this kind needs, so nothing required is missed.
---

The system works from a fixed list of every part a model of this kind needs. This is what makes a
result complete: every required part is either filled in from the paper or shown as a gap, so
nothing required is quietly skipped.

A model includes:

| Part | What it is |
|---|---|
| Variables | what the model tracks (for example susceptible, infected, recovered) and their starting values |
| Parameters | the constants (for example transmission rate, recovery rate, noise strength) and their values |
| Drift terms | the predictable part of each equation |
| Diffusion terms | the random (noise) part of each equation |
| Time span | the period the figure covers |

For each part, the system records the value from the paper with its source, or marks it
"not stated". See [Where each value comes from](/explanation/provenance/) and
[What it recognizes](/explanation/recognizes/).
