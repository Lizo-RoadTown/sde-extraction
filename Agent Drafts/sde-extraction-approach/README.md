# SDE Extraction — Approach

The approach to automating extraction of SDE epidemiological models from papers. All items here are
**agent drafts awaiting Liz's validation** (see [`../README.md`](../README.md)).

## Contents

| File | What it is | Author |
|---|---|---|
| [2026-06-05-document-architecture-canon.md](2026-06-05-document-architecture-canon.md) | **The governing canon.** Liz's contribution: constrain the *document's architecture* and force a present/absent decision at every node, so absence is preserved through the document's transformations instead of being hallucinated into a value. | **Liz** (transcribed by agent) |
| [2026-06-01-prior-art-and-pipeline.md](2026-06-01-prior-art-and-pipeline.md) | Prior-art research: DARPA ASKEM exists for deterministic ODE models but not SDEs; recommended pipeline; build-vs-borrow. | Multi-agent research workflow |

## How they relate

The **canon** is the principle; the **prior-art** doc is the landscape it operates in. The canon
reframes the pipeline: the Pydantic schema is not a set of constraints on valid SDEs — it is a
**map of the document's architecture** whose every slot forces *stated-value* or *explicitly-absent*.
The prior-art doc's "equation-to-code correctness is the hardest, least-solved part" is precisely the
problem the canon addresses: by refusing to manufacture absent values, it removes the largest source
of plausible-but-wrong extraction.

## Provenance note

The canon is **Liz's intellectual contribution** — the concept and the load-bearing rule (the document
presses for transformations; absence holds) are hers. The agent only put her spoken idea to the page.
When Liz reviews and promotes it to `Human validated/`, that promotion is the documented evidence of
her authorship — the thing a transcript alone cannot show.
