"""The knowledge-graph contract (the typed shape the UI reads — see ADR 0008 + memory kg-node-edge-model).

The graph is a deterministic READ-PROJECTION over papers / extractions / entity_tag (SQL views, see
migration 0010). Nothing computes it on the fly; the UI reads `graph_node` / `graph_edge`. This module
is the single source of truth for WHAT a node/edge may be — the same discipline as classification.py
(content vocabularies) and facets.py (the dimensions). The schema guard imports it so a bad kind/type
can't ship.

A FACET is not automatically a node. Three roles (the test: "would I stand on it and see everything
linked to it?"):
  - NODE   = a thing we relate (backbone: paper/model/variable/parameter/term; plus shared-dimension
             nodes we navigate by: pathogen/model-family/roles/author/affiliation/domain/field).
  - EDGE   = the relationship itself (contains, attached-to, about-pathogen, has-family, has-role, ...).
  - (PROPERTY = a fact painted on a node: page/quote/hashes/confidence/verification-status/order —
     these live on the node, never as their own node, so they are NOT in this contract.)
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


# --- node kinds (controlled) -------------------------------------------------
# Backbone = the real extracted things. Shared = dimensions worth navigating by (the cross-paper links).
NodeKind = Literal[
    # backbone
    "paper", "model", "variable", "parameter", "term",
    # shared-dimension nodes
    "pathogen", "model-family", "variable-role", "parameter-role",
    "author", "affiliation", "domain", "field",
]
BACKBONE_KINDS: tuple[NodeKind, ...] = ("paper", "model", "variable", "parameter", "term")
SHARED_KINDS: tuple[NodeKind, ...] = (
    "pathogen", "model-family", "variable-role", "parameter-role",
    "author", "affiliation", "domain", "field",
)
NODE_KINDS: tuple[NodeKind, ...] = BACKBONE_KINDS + SHARED_KINDS


# --- edge types (controlled) -------------------------------------------------
EdgeType = Literal[
    "contains",       # paper -> model (backbone containment)
    "attached-to",    # variable/parameter/term -> model (a piece belongs to a model)
    "about-pathogen", # model -> pathogen
    "has-family",     # model -> model-family
    "has-role",       # variable -> variable-role | parameter -> parameter-role
    "authored-by",    # paper -> author
    "affiliated-with",# author -> affiliation
    "in-domain",      # paper -> domain
    "in-field",       # paper -> field
    "derived-from",   # any value -> its proof/source (provenance)
    "cites",          # model/paper -> model/paper (lineage, later)
    "builds-on",      # model -> model (extends, later)
]
EDGE_TYPES: tuple[EdgeType, ...] = (
    "contains", "attached-to", "about-pathogen", "has-family", "has-role",
    "authored-by", "affiliated-with", "in-domain", "in-field",
    "derived-from", "cites", "builds-on",
)

# Allowed endpoints per edge type — an edge must connect kinds that make sense (determinism at the seam).
EDGE_ENDPOINTS: dict[EdgeType, tuple[tuple[NodeKind, ...], tuple[NodeKind, ...]]] = {
    "contains":        (("paper",), ("model",)),
    "attached-to":     (("variable", "parameter", "term"), ("model",)),
    "about-pathogen":  (("model",), ("pathogen",)),
    "has-family":      (("model",), ("model-family",)),
    "has-role":        (("variable", "parameter"), ("variable-role", "parameter-role")),
    "authored-by":     (("paper",), ("author",)),
    "affiliated-with": (("author",), ("affiliation",)),
    "in-domain":       (("paper",), ("domain",)),
    "in-field":        (("paper",), ("field",)),
    "derived-from":    (NODE_KINDS, NODE_KINDS),   # any node -> any node (provenance is general)
    "cites":           (("paper", "model"), ("paper", "model")),
    "builds-on":       (("model",), ("model",)),
}


class GraphNode(BaseModel):
    """One node in the projected graph. `id` is "<kind>:<key>" (e.g. 'pathogen:dengue', 'model:<uuid>')."""

    id: str
    kind: NodeKind
    label: str


class GraphEdge(BaseModel):
    """One typed, directed edge. source/target are GraphNode ids."""

    source: str
    target: str
    type: EdgeType


def node_id(kind: NodeKind, key: str) -> str:
    return f"{kind}:{key}"


def kind_of(node_id_str: str) -> str:
    return node_id_str.split(":", 1)[0]


def validate_edge(e: GraphEdge) -> bool:
    """An edge is valid if its type is known and its endpoints are allowed kinds for that type."""
    spec = EDGE_ENDPOINTS.get(e.type)
    if spec is None:
        return False
    src_kinds, dst_kinds = spec
    return kind_of(e.source) in src_kinds and kind_of(e.target) in dst_kinds
