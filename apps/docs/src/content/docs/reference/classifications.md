---
title: "Classifications — the running list"
description: Every classification the system knows so far (model families, transformations, variable roles, parameter roles) + the relationships between them + what's left to build out.
---

This is the running master list of everything the system classifies. It's how we keep sight of
what we know and decide what to build next.

- **Source of truth:** the registries live in code at `services/extraction/classification.py`. This
  page is the human-readable mirror — keep them in step.
- **Identification only.** A classification says *what a thing is*, never what its value must be.
  The actual SDE values stay verbatim present / absent.
- **It only grows through a human.** A new family/role enters via the classification-candidate
  review track (a person verifies it against a real paper), never by silent auto-add.
- **Provenance:** *corpus-confirmed* = seen in a completed review; *prior-art* = from the
  literature, not yet seen in our papers.
- *Last synced from `classification.py`: 2026-06-17 — 5 families · 4 transformations · 11 variable
  roles · 13 parameter roles · 1 calculus axis.*

## Stochastic-model families — *how the noise enters* (5)

| Family | Noise source | How the noise enters | Recognize by | Provenance |
|---|---|---|---|---|
| White-noise / Brownian (Wiener) | either | a Wiener increment `dB(t)` added to a rate: `dX = drift·dt + diffusion·dB` | `dB(t)`/`dW(t)` terms, "standard Brownian motion", "white noise" | corpus ✓ |
| Environmental / parametric (multiplicative) | environmental | a rate fluctuates: a parameter (often β) carries multiplicative noise `β → β + σ·dB` | noise on a transmission/contact rate; "environmental variability"; `σ·X·dB` | prior-art ✓ |
| Demographic / Chemical Langevin (diffusion approx.) | demographic | drift = the ODE; diffusion from event-rate covariance (CTMC→SDE limit); scales ~1/√N | per-event √rate diffusion; "diffusion approximation"; "chemical Langevin" | prior-art ✓ |
| Ornstein–Uhlenbeck parameter process | environmental | a parameter mean-reverts: `dx = θ(x̄−x)dt + σ·dB`, then feeds a rate | mean-reversion `θ(x̄−x)`; an auxiliary log-process; "Ornstein–Uhlenbeck" | corpus ✓ |
| Lévy / jump noise | environmental | discontinuous jumps via a Lévy/Poisson term, alongside or instead of Brownian diffusion | jump/Poisson integral terms; "Lévy"; "jump-diffusion" | corpus ✓ |

*All five carry a confirmed citation: Allen 2017 (Infect. Dis. Model. 2(2):128-142) for the first
four; Gillespie 2000 (chemical Langevin) for demographic; Wang et al. 2024 (Sci. Rep.) for OU; Zhou
et al. 2020 (Adv. Differ. Equ.) for Lévy — which is **not** in Allen.*

## Calculus convention — an axis (not a list)

`itô` · `stratonovich` · `unspecified` — recorded separately for every model.

## Transformations (4)

| Transformation | Recognize by | Provenance |
|---|---|---|
| Log / exponential transform of a variable | `x = log(·)` or `e^x`; an OU log-process feeding a rate | corpus ✓ |
| CTMC → SDE diffusion approximation | "diffusion approximation", van Kampen / system-size expansion | prior-art |
| Nondimensionalization / rescaling | scaled time/variables, dimensionless groups | prior-art |
| Change of variables (Itô's lemma) | Itô-lemma derivation, substitution adding drift terms | prior-art |

## Variable roles (11)

| Role | Typical symbols | Recognize by (from the stated meaning) | Seen in |
|---|---|---|---|
| Susceptible | S, SH, x | susceptible / uninfected / at-risk; target cells available | Cholera, Koufi, Witbooi |
| Exposed / latent | E, L, l | infected but not yet infectious | Chikungunya, Koufi, Viral Infection |
| Infected / infectious | I, IH, IV, Ip, Iq, y, D | infected / infectious / productively-infected cells | Typhoid, Malaria, Viral, HBV |
| Asymptomatic carrier | A | transmits without symptoms | Koufi |
| Recovered / removed | R, RH, Rp, Rq | recovered / removed / immune after infection | Witbooi, Malaria, Typhoid |
| Vaccinated / immunized | V, J | immunized by intervention *(V is ambiguous — see below)* | Witbooi |
| Pathogen load (virus / bacteria) | V, v, B | free virus / viral load / bacterial concentration | HBV, Viral, Typhoid, Chikungunya |
| Immune response (antibody / effector) | Z, w | antibody / immune effector / CTL level | Dengue OU, Viral Infection |
| Vector compartment (host-vector) | SV, IV | a vector (mosquito) compartment paired with human SH/IH/RH | Malaria |
| Host cell population (within-host) | H, D, x | a host cell population (hepatocytes, target/infected cells) | HBV, Viral Infection |
| Auxiliary stochastic process (NOT a compartment) | x | an OU log-process that *feeds* a rate; not a population | Dengue OU |

## Parameter roles (13)

| Role | Typical symbols | Expected value | Seen in |
|---|---|---|---|
| Recruitment / birth / inflow | Λ, lam, A, s, n | positive rate or count/time | Koufi, Witbooi, Mitra |
| Natural mortality / death rate | μ, muH, muV, d | small positive rate (1/time) | Dengue OU, Malaria, HBV |
| Transmission / infection / contact | β, betaHV, betaVH, λ | positive rate | Dengue OU, Malaria, Koufi, HBV |
| Recovery / clearance rate | γ, gammaH, γ1, γ2 | positive rate | Koufi, Viral Infection |
| Progression between stages | η, ε, ω, κ | positive rate | Koufi, Chikungunya, Typhoid |
| Disease-induced death / virulence | δ, α | positive rate | Dengue OU, HBV, Witbooi |
| **Noise intensity / diffusion coefficient** | σ, σ1…σ5, ζ, ξ | non-negative; one per noisy equation | Koufi, Chikungunya, HBV, Viral, Witbooi |
| **Mean-reversion rate (OU)** | θ | positive rate | Dengue OU |
| **OU long-run mean level** | x̄ | **often NOT stated → the canonical "requires inference" absent** | Dengue OU |
| Intervention rate (vaccination/treatment/quarantine) | v1, v2, v3, τ, φ, ψ, ϖ | non-negative rate | Typhoid, Koufi |
| Waning immunity / relapse | ρ, ω | non-negative rate | Chikungunya, Typhoid |
| Within-host rate (production/clearance/burst) | k, c, π, p, a, b | positive | HBV, Viral, Witbooi |
| Carrying capacity / population size / scaling | K, N, NH, n | positive count/size | Cholera, Malaria |

## Relationships between the classifications

These are the cross-cutting threads — useful for seeing how a piece of data connects to others.

- **The noise-source axis** (Allen's organizing principle) runs underneath the families:
  *demographic* (internal events) vs *environmental* (fluctuating parameters) vs *either*.
- **Symbol ambiguity — the same letter, different roles.** Role is read from the stated meaning,
  never the letter:
  - `V` → *vaccinated* **or** *pathogen load (virus)*
  - `x` → *susceptible / host cell* **or** *auxiliary OU process*
  - `Z` / `w` → *immune response*
- **Family ↔ parameter/variable ties** (these co-occur):
  - **Noise intensity (σ)** appears in *every* stochastic family — it's the magnitude of whatever
    noise term the family uses.
  - The **Ornstein–Uhlenbeck family** implies three other classifications together: the
    **mean-reversion rate (θ)** parameter, the **OU long-run mean (x̄)** parameter, the
    **auxiliary-process** variable role, and usually the **log-transform**.
  - **Vector-state** variable role ⇒ a host-vector model structure (paired human + vector
    compartments).
  - **Host-cell / pathogen-load / immune-response** roles ⇒ a within-host model structure.

## To build out — open questions & gaps (add to this section)

This is the working area. Add rows/notes as we go.

- **METATAGS are not yet classified — the biggest gap (Liz, 2026-06-17).** The classifications above
  are *content* (what a thing is scientifically). Separately we need **metatags**: the metadata every
  piece carries that gives it **location**, lets it be **verified as true**, and makes it
  **traceable**. These exist today only as scattered *fields*, never organized into a typed taxonomy:
  - *traceable* — `file_sha256` (Provenance), verbatim quote + page (Present), the rect + `located`
    flag (LocatorResult/locator), per-quote `span_sha256` (SpanProof/checksums_for).
  - *verifiable as true* — present/absent + `AbsenceReason` (`not_stated` / `requires_inference`),
    confidence tier (`exact / normalized / ambiguous / not_found`); the figure-repro oracle (not built).
  - *location* — only page + rect; no higher-level location tag.
  The metatags are likely where the graph's **location / distance** coordinate comes from — not the
  content classifications. **Action: define a deliberate metatag classification (location /
  verifiability / traceability tags), typed, that every piece carries.**
- **Model structure is not yet a classification.** The variable roles already hint at four
  structures in the corpus — *population/compartmental (SIR-family)*, *within-host* (HBV, Viral),
  *host-vector* (Malaria), *environmental-reservoir* (Cholera, Typhoid `B`). Worth making this its
  own dimension?
- **Pathogen is not yet a classification dimension** (dengue, malaria, cholera, HBV, chikungunya,
  typhoid…). It may be a key relationship axis between papers.
- **Figure / outcome types** are not yet classified (stochastic realizations, sensitivity sweep,
  phase portrait, time series…).
- **The interfaces themselves** are not yet classified (per the governing-layers rule — each data
  interface should be a typed, classified thing too).
- **Prior-art families not yet seen in our corpus:** environmental/parametric and demographic/CLE
  are literature-verified but `seen_in = []` — find real examples to make them corpus-confirmed.
- **Open design question:** what gives a piece of data its *place / distance* (for the observatory
  graph)? Could the classifications above be the coordinate? — undecided.
