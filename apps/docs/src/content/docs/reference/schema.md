---
title: Extraction schema
description: The Pydantic schema that constrains what the extractor returns — the present/absent slot, the model fields, and the lineage layer.
---

The extraction schema is the single source of truth for what the extractor returns. It is a
Pydantic model used directly as the response format for the language model, so the model is
*forced* to return data matching it. The schema lives in `services/extraction/schema.py`.

## The forced present/absent slot

Every captured fact is a `Slot`: a value the paper states, or an explicit absence.

```python
class Present(BaseModel):
    status: Literal["present"]
    value: str    # verbatim as written — never evaluated
    meaning: str
    quote: str    # exact source text — hashed for lineage
    page: int

class Absent(BaseModel):
    status: Literal["absent"]
    reason: AbsenceReason   # not_stated | requires_inference

Slot = Union[Present, Absent]
```

The two absence reasons are the only two ([the canon](/explanation/canon/) collapsed an
earlier set of four):

| Reason | Meaning |
|---|---|
| `not_stated` | a genuine gap — the paper does not state it |
| `requires_inference` | reachable only by inferring or deriving — the method refuses |

:::caution[A structured-outputs constraint]
`Slot` is a plain `Union`, **not** a Pydantic discriminated union. OpenAI Structured Outputs
rejects the JSON-schema `oneOf` that a discriminator emits; a plain union emits `anyOf`,
which is accepted. The `status` literal still distinguishes the two members.
:::

## The extracted model

One `(paper, figure)` extraction. Each field below is a `Slot` unless noted.

| Field | Type | Holds |
|---|---|---|
| `paper_title` | `Slot` | the paper's title |
| `pathogen` | `Slot` | the disease/pathogen modelled |
| `figure_label` | `str` | which figure this extraction targets |
| `state_variables` | `list` of `{symbol, initial_value: Slot}` | the compartments |
| `parameters` | `list` of `{symbol, value: Slot}` | named constants |
| `drift_terms` | `list` of `{variable, expression: Slot}` | the deterministic part |
| `diffusion_terms` | `list` of `{variable, expression: Slot}` | the stochastic part |
| `figure_binding` | `Slot` | "which values produced this figure?" |

## The lineage layer (filled by code, never the model)

After extraction, the pipeline computes a SHA-256 over each *present* slot's source quote
(`checksums_for`), producing one hash per captured piece. The model quotes; the code hashes.
See [Provenance & lineage](/explanation/provenance/).

## Status of the schema

The present/absent slot, the two-reason absence taxonomy, and verbatim transcription are
**approved and stable**. Which slots exist, the lineage design, and the figure binding are
**under review**. The **transformation-step node** (per the canon) is **not yet modeled** —
the main open piece.

*Source: `services/extraction/schema.py`.*
