---
title: What it recognizes
description: The kinds of models and model parts the system knows, in plain terms.
---

The system is built for stochastic epidemiological models. It recognizes the common kinds of model
and the common roles each part can play, so it knows what a symbol means even when different papers
use the same letter for different things.

What it recognizes is a library of knowledge that grows. The lists below are what it knows so far.
When a paper brings a kind of model or a role that is not yet in the library, a reviewer confirms it
and it is added, so the library widens as more papers come through. You can follow the process and
check each part against the paper in [Watch it work](/explanation/observability/); each extraction
also shows its real **completeness** (how much was found) — see [How sure it is](/explanation/confidence/).

## How randomness enters the model

| Kind | What it means |
|---|---|
| White noise (Brownian) | a steady random wobble added to a rate |
| Environmental noise | a rate itself fluctuates over time |
| Demographic noise | randomness from individual births, deaths, and infections |
| Ornstein-Uhlenbeck | a parameter drifts randomly around a long-run average |
| Levy / jump | sudden jumps, not just a smooth wobble |

## Roles a variable can play

Susceptible, exposed or latent, infected, asymptomatic, recovered, vaccinated, pathogen load (virus
or bacteria), immune response, vector compartments (for example mosquitoes), and host cells (in
within-host models).

## Roles a parameter can play

Birth or recruitment, natural death, transmission, recovery, progression between stages,
disease-caused death, noise strength, mean-reversion rate, intervention (vaccination or treatment),
waning immunity, within-host rates, and population size or scaling.

These labels are how the system knows, for example, that "V" means a vaccinated group in one paper
and viral load in another. It reads the role from what the paper says, not from the letter.
