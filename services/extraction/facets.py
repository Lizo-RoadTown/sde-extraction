"""The faceted tag system (ADR 0008 — internal docs/decisions/0008-faceted-tag-system.md).

STATUS (2026-06-17): DRAFT / UNDER REVIEW (Liz approves schema; see schema.py discipline).

Every descriptive dimension is a FACET, and every facet is a controlled vocabulary (for content
facets, the vocabulary lives in classification.py) or a free/derived value (bibliographic,
structural). A TAG assigns one value within one facet to one piece of data, carrying its proof
(quote / page / source hash). This is faceted classification governed SKOS-lite, modelled
relationally — NOT an ontology, NOT a triple store, NOT EAV. The knowledge graph is a later
projection of these tags (typed nodes = pieces, typed edges = shared facets / attachments).

The content facets reuse the registries in classification.py (single source of truth for those
vocabularies); facets.py adds the bibliographic / structural / proof facets and the Tag model.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

import classification as c


FacetKind = Literal["content", "bibliographic", "structural", "proof"]


class Facet(BaseModel):
    """One descriptive dimension. `controlled` = has a fixed vocabulary (a concept list);
    otherwise the value is free text or a derived identifier (e.g. an author name, a page)."""

    key: str
    label: str
    kind: FacetKind
    description: str
    controlled: bool = True


# The facet registry — every dimension a piece of data can be tagged along, in one place.
FACETS: list[Facet] = [
    # --- content: vocabularies live in classification.py ---
    Facet(key="model-family", label="Stochastic-model family", kind="content",
          description="how noise enters the model (white-noise, OU, Lévy, ...)"),
    Facet(key="transformation", label="Transformation", kind="content",
          description="an operation between the stated model and the figure (log-transform, ...)"),
    Facet(key="variable-role", label="Variable role", kind="content",
          description="what a state variable represents (susceptible, infected, ...)"),
    Facet(key="parameter-role", label="Parameter role", kind="content",
          description="what a constant represents (transmission, noise-intensity, ...)"),
    Facet(key="noise-source", label="Noise source", kind="content",
          description="demographic | environmental | either (Allen's axis)"),
    Facet(key="calculus-convention", label="Calculus convention", kind="content",
          description="ito | stratonovich | unspecified"),
    # --- bibliographic / governance: who & what made the data (pulled from the DOI via Crossref) ---
    Facet(key="author", label="Author", kind="bibliographic", controlled=False,
          description="an author of the paper (ORCID where available)"),
    Facet(key="affiliation", label="Affiliation", kind="bibliographic", controlled=False,
          description="an author's institution (ROR where available)"),
    Facet(key="journal", label="Journal / source", kind="bibliographic", controlled=False,
          description="the venue the paper was published in"),
    Facet(key="year", label="Year", kind="bibliographic", controlled=False,
          description="publication year"),
    Facet(key="doi", label="DOI", kind="bibliographic", controlled=False,
          description="the work identifier"),
    Facet(key="domain", label="Domain", kind="bibliographic",
          description="subject domain (MeSH-derived)"),
    Facet(key="field", label="Field", kind="bibliographic",
          description="field of science (OECD Fields of Science)"),
    Facet(key="pathogen", label="Pathogen", kind="bibliographic", controlled=False,
          description="the disease / pathogen modelled"),
    # --- structural: each piece's identity + where it attaches ---
    Facet(key="attached-to", label="Attached to", kind="structural", controlled=False,
          description="the variable / term / model this piece belongs to"),
    Facet(key="order", label="Order", kind="structural", controlled=False,
          description="position within its group (e.g. parameters[5])"),
    # --- proof: traceability + verifiability ---
    Facet(key="verification-status", label="Verification status", kind="proof",
          description="unverified | located | machine_verified | figure_reproduced | human_verified"),
    Facet(key="confidence-tier", label="Confidence tier", kind="proof",
          description="exact | normalized | ambiguous | not_found"),
]

# Proof-facet vocabularies (genuinely bounded axes).
VerificationStatus = Literal[
    "unverified", "located", "machine_verified", "figure_reproduced", "human_verified"
]
ConfidenceTier = Literal["exact", "normalized", "ambiguous", "not_found"]


def facet(key: str) -> Optional[Facet]:
    for f in FACETS:
        if f.key == key:
            return f
    return None


def concepts_for(facet_key: str) -> list[str]:
    """The controlled vocabulary for a content/proof facet (empty for free facets). Content
    vocabularies come from classification.py so there is one source of truth."""
    return {
        "model-family": c.known_family_names(),
        "transformation": [t.name for t in c.TRANSFORMATIONS],
        "variable-role": [r.name for r in c.VARIABLE_ROLES],
        "parameter-role": [r.name for r in c.PARAMETER_ROLES],
        "noise-source": ["demographic", "environmental", "either"],
        "calculus-convention": ["ito", "stratonovich", "unspecified"],
        "verification-status": list(VerificationStatus.__args__),  # type: ignore[attr-defined]
        "confidence-tier": list(ConfidenceTier.__args__),          # type: ignore[attr-defined]
    }.get(facet_key, [])


class Tag(BaseModel):
    """One faceted tag on one piece of data: a value within a facet, with its proof.

    For a controlled facet, `value` is a concept name (or a proposed new one with value_is_new=True,
    routed through the candidate HITL track). For a free facet, `value` is the literal (author name,
    page, etc.). The provenance fields anchor the tag to the source so a reviewer can verify it.
    """

    facet: str                      # a FACETS key
    value: str                      # concept name (controlled) or literal (free)
    value_is_new: bool = False      # proposed concept not yet in the vocabulary (audit it)
    # provenance (the proof the tag is real — the nanopublication model, stored as columns)
    quote: str = ""
    page: Optional[int] = None
    source_sha256: str = ""         # the source PDF fingerprint
    span_sha256: str = ""           # SHA-256 of the quote
    confidence: Optional[float] = None


def validate_tag(t: Tag) -> bool:
    """A tag is valid if its facet exists, and (for a controlled facet) its value is in the
    vocabulary, unless it is explicitly proposed as new (value_is_new)."""
    f = facet(t.facet)
    if f is None:
        return False
    if f.controlled and not t.value_is_new:
        return t.value in concepts_for(t.facet)
    return True


def facet_reference() -> str:
    """The facet list handed to a prompt / shown in docs — generated from this single source."""
    lines = ["Facets every piece of data can be tagged along:"]
    for f in FACETS:
        vocab = concepts_for(f.key)
        tail = f" (vocabulary: {', '.join(vocab)})" if vocab else " (free value)"
        lines.append(f"- [{f.kind}] {f.key} — {f.label}: {f.description}.{tail if len(tail) < 160 else ''}")
    return "\n".join(lines)
