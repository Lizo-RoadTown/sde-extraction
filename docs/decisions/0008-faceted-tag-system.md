---
title: "ADR 0008: The faceted tag system & the dependency knowledge graph"
description: How everything is classified — faceted controlled-vocabulary tags — and how the dependency/enterprise knowledge graph is projected from them.
---

**Status:** Accepted · **Date:** 2026-06-17

## Context

We classify scientific *content* (model families, variable roles, parameter roles) via small
self-growing registries (`services/extraction/classification.py`). Two realizations forced a
broader decision:

1. **Every descriptive dimension is a tag.** Not just families/roles — `noise_source`, provenance,
   calculus convention, a parameter's value-kind, author, domain, field, "which variable/term is
   this attached to" — all of it. Some of these were buried as inline `Literal`s, bools, and
   free-text strings; most metadata (author, domain, field, governing source) wasn't captured at all.
2. **The end goal is a dependency / enterprise knowledge graph.** Nodes = data pieces; edges =
   the dependencies/relationships between them — to be rendered live in the observatory, every node
   click-to-proof.

A skeptic must be able to verify each run independently, and pieces must relate to each other for
the graph. This ADR decides the one coherent system underneath all of that. (Researched against
established practice — see Research basis.)

## Decision

1. **Faceted classification.** Every descriptive dimension is an independent **facet**, and every
   facet is a **controlled vocabulary** — governed with **SKOS-lite** semantics (preferred label,
   synonyms/alt labels, broader/narrower/related, scheme membership). This is the established
   convention for a narrow domain. Our self-growing registries become the concept vocabularies; the
   **classification-candidate HITL track** (ADR-aligned) is exactly how a controlled vocabulary is
   meant to grow — governed, not folksonomic.

2. **Three tag families.**
   - **Content** (built): model families, variable roles, parameter roles, transformations,
     calculus convention.
   - **Bibliographic / governance** (mostly new): author, affiliation, journal/source, year, page,
     doi, domain, field. Pull from the **DOI via Crossref** (carries **ORCID** for authors, **ROR**
     for institutions). Domain/field from **MeSH** (biomedical controlled vocabulary, synonym
     control) plus **OECD Fields of Science** for a coarse field label.
   - **Structural + proof** (partly implicit today): each piece's id, what variable/term it is
     attached to, its order, and its source back-pointer; plus the proof tags — traceability
     (`file_sha256`, quote, page, bbox, per-quote hash) and verifiability (present/absent + reason,
     confidence tier, machine/human verified).

3. **Per-piece provenance = the nanopublication model, stored relationally.** Each datum is its own
   assertion + provenance + publication-info. We adopt the *model*, not the RDF stack — store it as
   plain, indexed, FK-constrained **Postgres columns** (source, page, quote, hash, confidence,
   verified-by, attached-to, order), kept export-clean so a future RDF-star / nanopublication
   emission is a mapping, not a rewrite.

4. **The inline attributes are promoted to first-class facets.** `noise_source`, `provenance`,
   `calculus_convention`, a parameter's value-kind (currently free text), and parameter
   category/type (missing) all become controlled vocabularies, not inline `Literal`s/bools/strings.

5. **The dependency / enterprise knowledge graph = typed nodes + typed edges.** Edge
   (relationship/dependency) types are *themselves* a classified vocabulary: `attached-to`
   (value→variable→model), `depends-on`, `derived-from` (provenance: value→source quote), `shares`
   (two models share a pathogen/parameter/family), `cites`. The KG is a **read-only projection** of
   the relational tag store — never a second system of record. The observatory renders it (live,
   click-to-proof); the dependency edges give the graph its shape and shared facets cluster it.

6. **Storage.** Postgres: a `facet` table + a `concept` (controlled-vocabulary term) table + an
   entity↔concept **join table** (foreign-key integrity) + `jsonb` columns as typed,
   Pydantic-validated extension points for genuinely open-ended bits. Pydantic enforces the
   vocabulary at the seam (the determinism-web principle).

## What we explicitly do NOT do

- **No OWL ontology** by default — routinely abandoned for cost, drift, and maintenance burden;
  SKOS-lite gives the governance we need without axiom-writing.
- **No raw EAV** (generic attribute-value table) — loses types, ranges, and foreign keys.
- **No free "tag soup"** — every tag is a controlled vocabulary, never an uncontrolled string.
- **No triple store / Neo4j as a system of record** — the KG is a projection of Postgres, not a
  parallel database. (DataCite, RO-Crate, RDF-star, nanopublication emission stay open as upgrade
  paths, adopted only on a concrete need.)

## Consequences

- **The tags are the graph's coordinate.** Pieces relate by shared tags + typed edges; the
  observatory's position/distance comes from the dependency graph, not from geography — closing the
  "what gives a node its place" question.
- **OpenAI stays the brain.** No new vendor or store — Postgres + Pydantic only; the model extracts
  tag *values*.
- **Reviewer-verifiable per-piece provenance** via plain SQL and our existing deterministic checks.
- Cost: a deliberate facet/concept/join schema + the Crossref/MeSH integrations to maintain —
  justified by the alternative (tag soup, or an abandoned ontology).

## Research basis

Faceted classification (Ranganathan) + SKOS as the governance layer
([SKOS Primer](https://www.w3.org/TR/skos-primer/); [faceted classification](https://berkeley.pressbooks.pub/tdo4p/chapter/faceted-classification/));
bibliographic identifiers ([Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/),
ORCID, [ROR](https://ror.org/about/)); domain vocabulary
([MeSH](https://www.nlm.nih.gov/mesh/intro_record_types.html), OECD Fields of Science);
statement-level provenance ([nanopublications](https://nanopub.net/));
relational tag modelling + anti-patterns ([PostgreSQL jsonb](https://www.postgresql.org/docs/current/datatype-json.html);
[EAV anti-pattern](https://tapoueh.org/blog/2018/03/database-modelization-anti-patterns/)).
Full synthesis recorded in session memory (`metatagging-direction`).
