# Formulation-family typology — literature verification

*Finding, 2026-06-14. Verifies the Step-1 model-classification registry
([services/extraction/classification.py](../../services/extraction/classification.py)) against the
authoritative stochastic-epidemic-modelling literature, so each family carries a confirmed primary
citation before it is treated as canonical. Closes the "citations UNVERIFIED" flag from
[2026-06-01-prior-art-and-pipeline.md](../../Agent%20Drafts/sde-extraction-approach/2026-06-01-prior-art-and-pipeline.md).*

## Question

The seed family typology came from prior art with **unverified** citations (attributed loosely to
Linda Allen). Are the five families real, named categories in the literature, and what is the
correct organizing axis?

## Method

Verified the canonical reference directly (read the Allen 2017 primer PDF, not just search
snippets) plus a primary source per family. Sources are open-access where possible.

## Key finding — the organizing axis is *noise source*

Allen's primary distinction is **demographic vs environmental** variability, not structural form
(Allen 2017, p.128): *"variability associated with individual dynamics such as transmission,
recovery, births or deaths is… **demographic variability**. The variability associated with the
environment… is referred to as **environmental variability**."* The primer restricts itself to
**CTMC and SDE** model types, and derives the SDE as a **diffusion approximation** of the CTMC
(§4): ΔX ≈ Normal(0, CV) — drift = the ODE, diffusion = √(covariance of the changes).

Our registry mixes *source* families (demographic, environmental) with *structural* ones (generic
Brownian, Lévy jump). We now record `noise_source` (demographic | environmental | either) on every
family to make that axis explicit. This is a refinement that came out of the verification.

## Verified families

| Family | noise_source | Verified? | Primary citation |
|---|---|---|---|
| white-noise-brownian | either | ✅ | Allen 2017 §4 — SDE as a diffusion process |
| environmental-parametric-noise | environmental | ✅ | Allen 2017 §1 + final section — environmental variability / fluctuating rates |
| demographic-noise-cle | demographic | ✅ | Allen 2017 §4 (diffusion approx) + Gillespie 2000 (chemical Langevin) |
| ornstein-uhlenbeck-parameter | environmental | ✅ | Allen 2017 (mean-reverting environmental) + Wang et al. 2024, Sci. Rep. |
| levy-jump | environmental | ✅ (not in Allen) | Zhou et al. 2020, Adv. Differ. Equ. — SIR with Lévy jump |

**Caveat worth keeping:** **Lévy/jump is NOT in Allen 2017** — she restricts to CTMC + diffusion
SDE. It is verified via its own dedicated jump-diffusion epidemic literature, which is a distinct,
active body of work motivated by severe/discontinuous perturbations. Recorded in the registry's
citation field so the provenance stays honest.

## Sources

- Allen, L.J.S. (2017). *A primer on stochastic epidemic models: Formulation, numerical simulation,
  and analysis.* Infectious Disease Modelling 2(2):128-142. DOI 10.1016/j.idm.2017.03.001.
  Open-access PDF: https://www.stat.cmu.edu/~kass/covid/Allen2017-PrimerStochasticEpiModels.pdf
- Gillespie, D.T. (2000). *The chemical Langevin equation.* J. Chem. Phys. 113:297-306.
- Wang et al. (2024). *Introducing a novel mean-reverting Ornstein–Uhlenbeck process based
  stochastic epidemic model.* Scientific Reports 14. https://www.nature.com/articles/s41598-024-52335-6
- Zhou et al. (2020). *A stochastic SIR epidemic model with Lévy jump and media coverage.* Advances
  in Difference Equations 2020:170. https://link.springer.com/article/10.1186/s13662-020-2521-6

## Consequence for the build

All five seed families are now `literature_verified=True` with a citation. The
demographic/environmental axis (`noise_source`) is part of the schema and the agent-facing
glossary. Still distinct from `provenance` (corpus-confirmed vs prior-art-candidate): a family can
be literature-verified yet not-yet-seen in our own corpus (environmental-parametric, demographic-cle
are exactly that — verified, `seen_in=[]`). New families added via the
[classification-candidate HITL track](../../docs/proposals/2026-06-13-classification-taxonomy-foundation.md)
should likewise attach a citation before they count as canonical.
