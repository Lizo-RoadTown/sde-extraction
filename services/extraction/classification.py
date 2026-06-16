"""STEP 1 — model + transformation classification (the identification layer).

STATUS (2026-06-13): DRAFT / UNDER REVIEW. Per the schema approval discipline (schema.py), Liz
validates classification shape before it locks. Seeded from the completed AT3 ground-truth reviews
(corpus-confirmed) + the prior-art typology (prior-art-candidate; Linda Allen taxonomy, CITATIONS
UNVERIFIED — verify before treating any family as canonical). Plan + rationale:
docs/proposals/2026-06-13-classification-taxonomy-foundation.md.

WHY THIS EXISTS — the user: "we have to create classifications so the agent knows what everything
is. Otherwise they will be confused." This is the reference the model-match step consults to
IDENTIFY a paper's stochastic model and match it to the chosen figure.

CANON (schema.py:8-12) — classification is IDENTIFICATION (recognize / route / match), NEVER a
VALUE constraint. Families live in a SELF-GROWING registry (match-or-add): the classifier matches
an observed model to a known family OR proposes a NEW one (flagged for human audit). We never
force an SDE into a predetermined shape; the drift/diffusion VALUES stay verbatim present/absent.
A registry that grows != an enum that forces invention.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


# ============================================================
# THE FORMULATION-FAMILY REGISTRY  (how the noise enters the model)
# Self-growing: this seed is the starting glossary, not a closed set.
# provenance: corpus-confirmed (seen in AT3 completed reviews) | prior-art-candidate (typology only)
# ============================================================

Provenance = Literal["corpus-confirmed", "prior-art-candidate"]

# Allen's primary organizing axis (Allen 2017, Infect. Dis. Model. 2(2):128-142, p.128):
# DEMOGRAPHIC variability = internal, from discrete transmission/recovery/birth/death events;
# ENVIRONMENTAL variability = external, parameters fluctuate with conditions. "either" = a
# structural family that can carry either source (e.g. a generic Brownian or jump term).
NoiseSource = Literal["demographic", "environmental", "either"]


class FormulationFamily(BaseModel):
    """One way stochasticity enters an SDE epidemic model — a category, not a value.

    `recognized_by` are the cues the classifier looks for; `how_noise_enters` is the structural
    signature; `noise_source` is Allen's demographic/environmental axis; `seen_in` anchors the
    family to real ground-truth papers and `citation` to the verifying literature (the determinism
    web: every category is traceable, not invented).
    """

    name: str                         # the match key, e.g. "ornstein-uhlenbeck-parameter"
    label: str                        # human label, e.g. "Ornstein–Uhlenbeck parameter process"
    how_noise_enters: str             # the structural signature
    noise_source: NoiseSource         # Allen's axis: demographic | environmental | either
    recognized_by: str                # cues in equations/prose the classifier keys on
    provenance: Provenance
    literature_verified: bool = False  # has a primary citation been attached + confirmed?
    citation: str = ""                # the verifying primary source (see research/findings)
    seen_in: list[str] = []           # ground-truth examples (AT3 completed reviews)


# Seed registry. Corpus-confirmed families come from the completed reviews
# (AT3_review/reviews/completed/**); candidates come from the prior-art typology
# (Agent Drafts/sde-extraction-approach/2026-06-01-prior-art-and-pipeline.md:87-104).
FORMULATION_FAMILIES: list[FormulationFamily] = [
    FormulationFamily(
        name="white-noise-brownian",
        label="White-noise / Brownian (Wiener) perturbation",
        how_noise_enters="a Wiener increment dB(t) added to rate(s): dX = drift·dt + diffusion·dB",
        noise_source="either",
        recognized_by="dB(t)/dW(t) terms, 'standard Brownian motion', 'white noise', no naming of a parameter process",
        provenance="corpus-confirmed",
        literature_verified=True,
        citation="Allen 2017, Infect. Dis. Model. 2(2):128-142, §4 (SDE from a diffusion process)",
        seen_in=["Witbooi_Malaria", "(default for papers that write dB without naming a family)"],
    ),
    FormulationFamily(
        name="environmental-parametric-noise",
        label="Environmental / parametric (multiplicative) noise",
        how_noise_enters="a rate fluctuates: a parameter (often β) carries multiplicative noise, e.g. β -> β + σ·dB",
        noise_source="environmental",
        recognized_by="noise attached to a transmission/contact rate; 'environmental fluctuation/variability'; multiplicative σ·X·dB",
        provenance="prior-art-candidate",
        literature_verified=True,
        citation="Allen 2017, §1 + final section (environmental variability; fluctuating rates)",
        seen_in=[],
    ),
    FormulationFamily(
        name="demographic-noise-cle",
        label="Demographic noise / Chemical Langevin (diffusion approximation)",
        how_noise_enters="drift = the ODE; diffusion from event-rate covariance (CTMC -> SDE limit); scales ~1/sqrt(N)",
        noise_source="demographic",
        recognized_by="per-event √rate diffusion terms; 'diffusion approximation'; 'chemical Langevin'; population-size scaling",
        provenance="prior-art-candidate",
        literature_verified=True,
        citation="Allen 2017, §4 (ΔX ≈ Normal(0, CV); drift=ODE, diffusion=√covariance); Gillespie 2000, J. Chem. Phys. 113:297 (chemical Langevin)",
        seen_in=[],
    ),
    FormulationFamily(
        name="ornstein-uhlenbeck-parameter",
        label="Ornstein–Uhlenbeck parameter process",
        how_noise_enters="a parameter mean-reverts stochastically: dx = θ(x̄ − x)dt + σ·dB, then feeds a rate",
        noise_source="environmental",
        recognized_by="mean-reversion θ(x̄−x); an auxiliary log-process variable; 'Ornstein–Uhlenbeck'",
        provenance="corpus-confirmed",
        literature_verified=True,
        citation="Allen 2017, final section (environmental variability as mean-reverting); Wang et al. 2024, Sci. Rep. 14, s41598-024-52335-6 (mean-reverting OU epidemic model)",
        seen_in=["Dengue Infection OrnsteinUhlenbeck", "10_1007s00332.023_copy"],
    ),
    FormulationFamily(
        name="levy-jump",
        label="Lévy / jump noise",
        how_noise_enters="discontinuous jumps via a Lévy/Poisson term in addition to (or instead of) Brownian diffusion",
        noise_source="environmental",
        recognized_by="jump/Poisson integral terms, 'Lévy', compensated jumps, 'jump-diffusion'",
        provenance="corpus-confirmed",
        literature_verified=True,
        citation="Zhou et al. 2020, Adv. Differ. Equ. 2020:170, s13662-020-2521-6 (SIR Lévy jump); NOT in Allen 2017 (she restricts to CTMC + diffusion SDE)",
        seen_in=["Cholera", "Viral Infection", "Dengue Infection OrnsteinUhlenbeck"],
    ),
]


# ============================================================
# THE CALCULUS CONVENTION  (a genuinely bounded axis — a math dichotomy, recorded separately)
# ============================================================

CalculusConvention = Literal["ito", "stratonovich", "unspecified"]


# ============================================================
# THE TRANSFORMATION REGISTRY  (operations applied between the stated model and the figure)
# Self-growing, same match-or-add discipline as families.
# ============================================================


class Transformation(BaseModel):
    name: str
    label: str
    recognized_by: str
    provenance: Provenance
    seen_in: list[str] = []


TRANSFORMATIONS: list[Transformation] = [
    Transformation(name="log-transform", label="Log / exponential transform of a variable",
                   recognized_by="x = log(·) or e^x substitution; an OU log-process feeding a rate",
                   provenance="corpus-confirmed", seen_in=["Dengue Infection OrnsteinUhlenbeck"]),
    Transformation(name="diffusion-approximation", label="CTMC → SDE diffusion approximation",
                   recognized_by="'diffusion approximation', van Kampen / system-size expansion, event-rate covariance",
                   provenance="prior-art-candidate"),
    Transformation(name="nondimensionalization", label="Nondimensionalization / rescaling",
                   recognized_by="scaled time/variables, dimensionless groups",
                   provenance="prior-art-candidate"),
    Transformation(name="change-of-variables", label="Change of variables (Itô's lemma applied)",
                   recognized_by="Itô-lemma derivation, substitution introducing extra drift terms",
                   provenance="prior-art-candidate"),
]


# ============================================================
# THE CLASSIFICATION OUTPUT  (what the model-match step returns — identification only)
# ============================================================


class ModelClassification(BaseModel):
    """The identification the model-match step produces for ONE (paper, figure) anchor.

    Identification fields only — never SDE-value constraints. Anchored to the document by an
    evidence quote + page so a script can verify it (the determinism web: falsifiable at the seam).
    Never invents: if the family can't be determined, set family_name='unclassified'. If the model
    is a family not in the registry, set family_is_new=True and propose the name (human audits it).
    """

    family_name: str                         # a FORMULATION_FAMILIES name, "unclassified", or a proposed new name
    family_is_new: bool = False              # True => proposed family not yet in the registry (audit it)
    calculus_convention: CalculusConvention = "unspecified"
    transformations: list[str] = []          # TRANSFORMATIONS names (or proposed new ones)
    evidence_quote: str = ""                 # verbatim text supporting the family call (verifiable)
    evidence_page: Optional[int] = None
    rationale: str = ""                      # brief: why this family, grounded in the figure/equations


# ============================================================
# REGISTRY HELPERS  (match-or-add; build the prompt reference from the single source)
# ============================================================


def _norm(s: str) -> str:
    s = s.strip().lower()
    for ch in ("–", "—", "_", " "):  # en-dash, em-dash, underscore, space -> hyphen
        s = s.replace(ch, "-")
    while "--" in s:
        s = s.replace("--", "-")
    return s


def match_family(name: str) -> Optional[FormulationFamily]:
    """Return the registry family matching `name` (by name or label), else None (=> propose new)."""
    key = _norm(name)
    for fam in FORMULATION_FAMILIES:
        if _norm(fam.name) == key or _norm(fam.label) == key:
            return fam
    return None


def known_family_names() -> list[str]:
    return [f.name for f in FORMULATION_FAMILIES]


def registry_reference() -> str:
    """The glossary text handed to the classifier prompt — generated from this single source so the
    prompt and the registry never drift. 'so the agent knows what everything is.'"""
    lines = ["Known stochastic-model families (match one, or propose a new name if none fit):"]
    for f in FORMULATION_FAMILIES:
        lines.append(f"- {f.name} — {f.label} [{f.noise_source} noise]: {f.how_noise_enters}. Recognize by: {f.recognized_by}.")
    lines.append("Transformations (list any that apply, or propose new):")
    for t in TRANSFORMATIONS:
        lines.append(f"- {t.name} — {t.label}. Recognize by: {t.recognized_by}.")
    lines.append("Calculus convention: one of ito | stratonovich | unspecified.")
    lines.append("If the family cannot be determined from the document, use 'unclassified' — never guess.")
    return "\n".join(lines)


# ============================================================
# THE CLASSIFICATION-CANDIDATE HITL TRACK  (the governed "add" half of match-or-add)
#
# A SECOND, STARRED pathway, distinct from extraction pass/fail. When the model-match proposes a
# NEW family/transformation (ModelClassification.family_is_new) or cannot classify
# (family_name == "unclassified"), the paper does NOT go straight to pass/fail. It:
#   1. raises a ClassificationCandidate (added to the candidates list),
#   2. PARKS the extraction at the `needs_classification` gate (Track B blocks Track A),
#   3. a human is led through the paper again to verify the new classification,
#   4. on approval the registry GROWS (candidate_to_entry) and any new rules are applied,
#      unblocking the gate,
#   5. the paper re-enters the NORMAL pathway (re-extract with the now-known class) -> pass/fail.
# Design: docs/proposals/2026-06-13-classification-taxonomy-foundation.md
# ============================================================

# Status an extraction parks in while its candidate is reviewed. Sits BEFORE 'needs_human'
# (Track A): Track B must resolve first. (Persisted as extractions.status in a later migration.)
NEEDS_CLASSIFICATION = "needs_classification"

CandidateKind = Literal["formulation_family", "transformation", "variable_role", "parameter_role"]
CandidateStatus = Literal["pending", "approved", "rejected", "merged"]


class ClassificationCandidate(BaseModel):
    """A proposed NEW classification raised by the model-match, awaiting human verification.

    Evidence-anchored (quote + page) so the reviewer — and a script — can check it against the
    paper (the determinism web). Approving converts it to a registry entry (candidate_to_entry)
    and unblocks the paper; 'merged' means the reviewer mapped it onto an existing family instead.
    """

    kind: CandidateKind = "formulation_family"
    proposed_name: str = ""           # the agent's proposed slug (blank if it just said 'unclassified')
    proposed_label: str = ""
    how_noise_enters: str = ""        # families only
    recognized_by: str = ""
    evidence_quote: str = ""
    evidence_page: Optional[int] = None
    source_paper_id: str = ""
    source_job_id: Optional[str] = None
    rationale: str = ""
    status: CandidateStatus = "pending"
    merged_into: Optional[str] = None  # set when status == 'merged' (an existing family name)


def trigger_candidate(
    mc: "ModelClassification", *, paper_id: str, job_id: Optional[str] = None,
) -> Optional[ClassificationCandidate]:
    """Deterministic trigger for the starred track: raise a candidate IFF the model-match proposed
    a new family or could not classify. Returns None when a known family matched (the paper goes
    straight down the normal pathway). This is the gate's on/off switch — falsifiable, not a guess."""
    if mc.family_is_new or mc.family_name == "unclassified":
        proposed = mc.family_name if mc.family_is_new else ""
        return ClassificationCandidate(
            kind="formulation_family",
            proposed_name=proposed,
            proposed_label=proposed,
            evidence_quote=mc.evidence_quote,
            evidence_page=mc.evidence_page,
            source_paper_id=paper_id,
            source_job_id=job_id,
            rationale=mc.rationale,
        )
    return None


def candidate_to_entry(c: ClassificationCandidate) -> "FormulationFamily | Transformation | VariableRole":
    """The 'unblock -> grow' operation: a human-APPROVED candidate becomes a registry entry the
    caller appends to FORMULATION_FAMILIES / TRANSFORMATIONS / VARIABLE_ROLES (and persists). It's
    corpus-confirmed by definition — it came from a real paper a human verified."""
    seen = [c.source_paper_id] if c.source_paper_id else []
    if c.kind == "transformation":
        return Transformation(
            name=_norm(c.proposed_name), label=c.proposed_label or c.proposed_name,
            recognized_by=c.recognized_by, provenance="corpus-confirmed", seen_in=seen,
        )
    if c.kind == "variable_role":
        return VariableRole(
            name=_norm(c.proposed_name), label=c.proposed_label or c.proposed_name,
            recognized_by=c.recognized_by, provenance="corpus-confirmed", seen_in=seen,
        )
    if c.kind == "parameter_role":
        return ParameterRole(
            name=_norm(c.proposed_name), label=c.proposed_label or c.proposed_name,
            recognized_by=c.recognized_by, provenance="corpus-confirmed", seen_in=seen,
        )
    return FormulationFamily(
        name=_norm(c.proposed_name), label=c.proposed_label or c.proposed_name,
        how_noise_enters=c.how_noise_enters, recognized_by=c.recognized_by,
        provenance="corpus-confirmed", seen_in=seen,
    )


# ============================================================
# STEP 2 — VARIABLE / INITIAL-CONDITION CLASSIFICATION
#
# So the variable sub-agents know what each state variable IS — its ROLE — and can match the
# model's variables to the figure's panels. Seeded from the 12 completed AT3 reviews (every role
# below is corpus-confirmed). Same canon as Step 1: classify the ROLE (identification), never the
# value; self-growing match-or-add registry; the present/absent VALUE (meaning, initial_value)
# stays in schema.py's Slots.
#
# THE CENTRAL HAZARD (why this exists): the SAME SYMBOL means DIFFERENT roles across papers —
#   V = vaccinated (Witbooi) AND viral load (HBV, within-host);  x = an OU log-process noise
#   driver (Dengue) AND target cells (Viral Infection);  Z/w = immune response.
# So the role MUST be read from the paper's stated meaning, NEVER inferred from the letter.
# `typical_symbols` are conventions to recognize by, NOT constraints.
# ============================================================


class VariableRole(BaseModel):
    name: str                       # match key, e.g. "auxiliary-process"
    label: str
    recognized_by: str              # cues in the stated meaning the classifier keys on
    typical_symbols: list[str] = []  # common letters — CONVENTION, not a rule (symbols are ambiguous)
    provenance: Provenance = "corpus-confirmed"
    seen_in: list[str] = []


VARIABLE_ROLES: list[VariableRole] = [
    VariableRole(name="susceptible", label="Susceptible",
                 recognized_by="susceptible / uninfected / at-risk; target cells available to infect",
                 typical_symbols=["S", "SH", "x"], seen_in=["Cholera", "Koufi", "Witbooi_Malaria"]),
    VariableRole(name="exposed-latent", label="Exposed / latent",
                 recognized_by="exposed / latent / incubating — infected but not yet infectious",
                 typical_symbols=["E", "L", "l"], seen_in=["Chikungunya Virus", "Koufi", "Viral Infection"]),
    VariableRole(name="infected", label="Infected / infectious",
                 recognized_by="infected / infectious / productively-infected cells",
                 typical_symbols=["I", "IH", "IV", "Ip", "Iq", "y", "D"],
                 seen_in=["Typhoid Fever Pneumonia", "Malaria", "Viral Infection", "HBV"]),
    VariableRole(name="asymptomatic", label="Asymptomatic carrier",
                 recognized_by="asymptomatic / mild — transmits without symptoms",
                 typical_symbols=["A"], seen_in=["DOI_10.1016_Koufi_2022"]),
    VariableRole(name="recovered", label="Recovered / removed",
                 recognized_by="recovered / removed / immune after infection",
                 typical_symbols=["R", "RH", "Rp", "Rq"], seen_in=["Witbooi_Malaria", "Malaria", "Typhoid Fever Pneumonia"]),
    VariableRole(name="vaccinated", label="Vaccinated / immunized",
                 recognized_by="vaccinated / immunized by intervention (NOTE: V also denotes viral load — read the meaning)",
                 typical_symbols=["V", "J"], seen_in=["Witbooi_Malaria"]),
    VariableRole(name="pathogen-load", label="Pathogen load (virus / bacteria)",
                 recognized_by="free virus / viral load / bacterial concentration — a pathogen quantity, not a host count",
                 typical_symbols=["V", "v", "B"], seen_in=["HBV", "Viral Infection", "Typhoid Fever Pneumonia", "Chikungunya Virus"]),
    VariableRole(name="immune-response", label="Immune response (antibody / effector)",
                 recognized_by="antibody / immune effector / CTL response level",
                 typical_symbols=["Z", "w"], seen_in=["Dengue Infection OrnsteinUhlenbeck", "Viral Infection"]),
    VariableRole(name="vector-state", label="Vector compartment (host-vector model)",
                 recognized_by="a vector (e.g. mosquito) compartment — paired SV/IV alongside human SH/IH/RH",
                 typical_symbols=["SV", "IV"], seen_in=["Malaria"]),
    VariableRole(name="host-cell", label="Host cell population (within-host)",
                 recognized_by="a host cell population in a within-host model (hepatocytes, target/infected cells)",
                 typical_symbols=["H", "D", "x"], seen_in=["HBV", "Viral Infection"]),
    VariableRole(name="auxiliary-process", label="Auxiliary stochastic process (NOT a compartment)",
                 recognized_by="an auxiliary stochastic driver (e.g. an Ornstein–Uhlenbeck log-process) that FEEDS a rate; not a population",
                 typical_symbols=["x"], seen_in=["Dengue Infection OrnsteinUhlenbeck", "10_1007s00332.023_copy"]),
]


class VariableClassification(BaseModel):
    """A variable sub-agent's identification of ONE state variable for the chosen figure.

    Identification only (the role), evidence-anchored. The variable's MEANING and INITIAL_VALUE
    stay present/absent Slots in schema.py; `initial_condition` here just flags the IC status so the
    sub-agent knows whether to record it stated, not_stated, or requires_inference (never invent).
    """

    symbol: str                                # the variable, from the figure-panel checklist
    role: str                                  # a VARIABLE_ROLES name | "unclassified" | a proposed new name
    role_is_new: bool = False                  # True => proposed role not in the registry (audit it)
    initial_condition: Literal["stated", "not_stated", "requires_inference"] = "not_stated"
    evidence_quote: str = ""                   # verbatim text supporting the role call
    evidence_page: Optional[int] = None
    rationale: str = ""


def match_role(name: str) -> Optional[VariableRole]:
    key = _norm(name)
    for r in VARIABLE_ROLES:
        if _norm(r.name) == key or _norm(r.label) == key:
            return r
    return None


def trigger_variable_candidate(
    vc: VariableClassification, *, paper_id: str, job_id: Optional[str] = None,
) -> Optional[ClassificationCandidate]:
    """Starred-track trigger for a NEW variable role (same governed-add as families)."""
    if vc.role_is_new or vc.role == "unclassified":
        proposed = vc.role if vc.role_is_new else ""
        return ClassificationCandidate(
            kind="variable_role", proposed_name=proposed, proposed_label=proposed,
            evidence_quote=vc.evidence_quote, evidence_page=vc.evidence_page,
            source_paper_id=paper_id, source_job_id=job_id, rationale=vc.rationale,
        )
    return None


def variable_registry_reference() -> str:
    """Glossary handed to the variable sub-agent prompt — generated from this single source."""
    lines = ["Known variable roles (classify each variable's ROLE from its STATED MEANING — "
             "NEVER from its letter; the same symbol means different roles in different papers):"]
    for r in VARIABLE_ROLES:
        lines.append(f"- {r.name} — {r.label}. Recognize by: {r.recognized_by}. Common symbols (convention only): {', '.join(r.typical_symbols)}.")
    lines.append("If the role cannot be determined from the document, use 'unclassified' — never guess.")
    lines.append("Record the initial condition as stated | not_stated | requires_inference (never invent a value).")
    return "\n".join(lines)


# ============================================================
# STEP 3 — PARAMETER CLASSIFICATION
#
# So the parameter sub-agents know what each constant IS (its role), and — per Liz — know when to
# SKIP a symbol (not a model parameter), when to mark it ABSENT (value not stated / requires
# inference), or how to CONSTRAIN the value search (the role says what KIND of value to expect).
# Seeded from the 12 completed AT3 reviews. Same canon: classify the role, never invent the value.
#
# The SDE-critical roles the harvest surfaced: noise-intensity (sigma/sigma1..n — the diffusion
# coefficients), mean-reversion-rate (theta), reversion-level (x_bar — the CANONICAL absent:
# "never stated explicitly" -> requires_inference, per the Dengue OU review).
# ============================================================


class ParameterRole(BaseModel):
    name: str
    label: str
    recognized_by: str
    typical_symbols: list[str] = []   # CONVENTION only — symbols vary by paper
    constrains: str = ""              # what KIND of value to expect (guidance, not a hard bound)
    provenance: Provenance = "corpus-confirmed"
    seen_in: list[str] = []


PARAMETER_ROLES: list[ParameterRole] = [
    ParameterRole(name="recruitment", label="Recruitment / birth / inflow",
                  recognized_by="inflow into the population (births, recruitment, immigration)",
                  typical_symbols=["Lambda", "lam", "A", "s", "n"], constrains="positive rate or count/time",
                  seen_in=["Koufi", "Witbooi_Malaria", "DOI_10.26782_Mitra_2024"]),
    ParameterRole(name="natural-mortality", label="Natural mortality / death rate",
                  recognized_by="natural death / per-capita mortality (not disease-induced)",
                  typical_symbols=["mu", "muH", "muV", "d"], constrains="small positive rate (1/time)",
                  seen_in=["Dengue Infection OrnsteinUhlenbeck", "Malaria", "HBV"]),
    ParameterRole(name="transmission", label="Transmission / infection / contact rate",
                  recognized_by="rate of new infections / force of infection / contact rate",
                  typical_symbols=["beta", "betaHV", "betaVH", "lambda", "lam"], constrains="positive rate",
                  seen_in=["Dengue Infection OrnsteinUhlenbeck", "Malaria", "Koufi", "HBV"]),
    ParameterRole(name="recovery", label="Recovery / clearance rate",
                  recognized_by="rate of recovery / clearance from infectious state",
                  typical_symbols=["gamma", "gammaH", "gamma1", "gamma2"], constrains="positive rate",
                  seen_in=["Koufi", "Viral Infection"]),
    ParameterRole(name="progression", label="Progression between stages",
                  recognized_by="rate of moving between compartments (exposed→infectious, latent→active)",
                  typical_symbols=["eta", "epsilon", "omega", "kappa"], constrains="positive rate",
                  seen_in=["Koufi", "Chikungunya Virus", "Typhoid Fever Pneumonia"]),
    ParameterRole(name="disease-mortality", label="Disease-induced death / virulence",
                  recognized_by="extra mortality caused by the disease (beyond natural death)",
                  typical_symbols=["delta", "alpha"], constrains="positive rate",
                  seen_in=["Dengue Infection OrnsteinUhlenbeck", "HBV", "Witbooi_Malaria"]),
    ParameterRole(name="noise-intensity", label="Noise intensity / diffusion coefficient",
                  recognized_by="the σ on a Wiener/Brownian term — magnitude of the stochastic perturbation",
                  typical_symbols=["sigma", "sigma1", "sigma2", "sigma3", "sigma4", "sigma5", "zeta", "xi"],
                  constrains="non-negative; one per noisy equation/rate",
                  seen_in=["Koufi", "Chikungunya Virus", "HBV", "Viral Infection", "Witbooi_Malaria"]),
    ParameterRole(name="mean-reversion-rate", label="Mean-reversion rate (Ornstein–Uhlenbeck)",
                  recognized_by="speed at which an OU process reverts to its mean (θ in dx=θ(x̄−x)dt+σdB)",
                  typical_symbols=["theta"], constrains="positive rate",
                  seen_in=["Dengue Infection OrnsteinUhlenbeck", "10_1007s00332.023_copy"]),
    ParameterRole(name="reversion-level", label="OU long-run mean level",
                  recognized_by="the x̄ an OU process reverts to (the long-run mean of the fluctuating parameter)",
                  typical_symbols=["x_bar"], constrains="OFTEN NOT STATED — the canonical requires_inference absent",
                  seen_in=["Dengue Infection OrnsteinUhlenbeck", "10_1007s00332.023_copy"]),
    ParameterRole(name="intervention-rate", label="Intervention rate (vaccination / treatment / quarantine)",
                  recognized_by="rate of a control: vaccination, treatment, quarantine, isolation",
                  typical_symbols=["v1", "v2", "v3", "tau", "phi", "psi", "varpi"], constrains="non-negative rate",
                  seen_in=["Typhoid Fever Pneumonia", "Koufi"]),
    ParameterRole(name="waning", label="Waning immunity / relapse",
                  recognized_by="loss of immunity / relapse back to susceptible or infectious",
                  typical_symbols=["rho", "omega"], constrains="non-negative rate",
                  seen_in=["Chikungunya Virus", "Typhoid Fever Pneumonia"]),
    ParameterRole(name="within-host-rate", label="Within-host rate (production / clearance / burst)",
                  recognized_by="within-host kinetics: virion production, cell infection, burst size, clearance",
                  typical_symbols=["k", "c", "pi", "p", "a", "b"], constrains="positive",
                  seen_in=["HBV", "Viral Infection", "Witbooi_Malaria"]),
    ParameterRole(name="scaling", label="Carrying capacity / population size / scaling",
                  recognized_by="a total population, carrying capacity, or scaling constant (not a rate)",
                  typical_symbols=["K", "N", "NH", "n"], constrains="positive count/size",
                  seen_in=["Cholera", "Malaria"]),
]


class ParameterClassification(BaseModel):
    """A parameter sub-agent's identification + disposition for ONE symbol in the model.

    `disposition` encodes Liz's three decisions directly: SKIP a non-parameter symbol, mark it
    ABSENT (not stated / requires inference), or EXTRACT a stated value. The `role` says what KIND
    of value to expect (constrains the search — guidance, not a hard bound). Value/meaning stay
    present/absent Slots in schema.py; this never invents a value.
    """

    symbol: str
    role: str                                  # a PARAMETER_ROLES name | "unclassified" | "not-a-parameter" | proposed
    role_is_new: bool = False
    disposition: Literal["extract", "skip", "absent_not_stated", "absent_requires_inference"] = "absent_not_stated"
    evidence_quote: str = ""
    evidence_page: Optional[int] = None
    rationale: str = ""


def match_parameter_role(name: str) -> Optional[ParameterRole]:
    key = _norm(name)
    for r in PARAMETER_ROLES:
        if _norm(r.name) == key or _norm(r.label) == key:
            return r
    return None


def trigger_parameter_candidate(
    pc: ParameterClassification, *, paper_id: str, job_id: Optional[str] = None,
) -> Optional[ClassificationCandidate]:
    """Starred-track trigger for a NEW parameter role (same governed-add). 'skip'/'not-a-parameter'
    is NOT a candidate — it's a deterministic skip, not an unknown classification."""
    if pc.role_is_new or pc.role == "unclassified":
        proposed = pc.role if pc.role_is_new else ""
        return ClassificationCandidate(
            kind="parameter_role", proposed_name=proposed, proposed_label=proposed,
            evidence_quote=pc.evidence_quote, evidence_page=pc.evidence_page,
            source_paper_id=paper_id, source_job_id=job_id, rationale=pc.rationale,
        )
    return None


def parameter_registry_reference() -> str:
    """Glossary handed to the parameter sub-agent prompt — generated from this single source."""
    lines = ["Known parameter roles (classify each constant's ROLE from its stated meaning; the "
             "role tells you what KIND of value to expect):"]
    for r in PARAMETER_ROLES:
        lines.append(f"- {r.name} — {r.label}. Recognize by: {r.recognized_by}. Symbols (convention): {', '.join(r.typical_symbols)}. Expect: {r.constrains}.")
    lines.append("Disposition per symbol — SKIP if it is not a model parameter (an index, a function); "
                 "ABSENT (not_stated / requires_inference) if it is a parameter but no value is stated "
                 "(e.g. an OU x̄ that is never given); EXTRACT only a value written verbatim. Never invent.")
    return "\n".join(lines)
