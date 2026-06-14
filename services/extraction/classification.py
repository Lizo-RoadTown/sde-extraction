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

CandidateKind = Literal["formulation_family", "transformation"]
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


def candidate_to_entry(c: ClassificationCandidate) -> "FormulationFamily | Transformation":
    """The 'unblock -> grow' operation: a human-APPROVED candidate becomes a registry entry the
    caller appends to FORMULATION_FAMILIES / TRANSFORMATIONS (and persists). It's corpus-confirmed
    by definition — it came from a real paper a human verified."""
    seen = [c.source_paper_id] if c.source_paper_id else []
    if c.kind == "transformation":
        return Transformation(
            name=_norm(c.proposed_name), label=c.proposed_label or c.proposed_name,
            recognized_by=c.recognized_by, provenance="corpus-confirmed", seen_in=seen,
        )
    return FormulationFamily(
        name=_norm(c.proposed_name), label=c.proposed_label or c.proposed_name,
        how_noise_enters=c.how_noise_enters, recognized_by=c.recognized_by,
        provenance="corpus-confirmed", seen_in=seen,
    )
