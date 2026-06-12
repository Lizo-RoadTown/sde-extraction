---
title: The observability spine
description: The organizing principle of the interface — every data hand-off is an observable, provenance-tracked window, woven into one smooth transaction.
---

The user interface is built on a single principle: it is an **observability instrument**.
Its job is to make every place a piece of data crosses from one interface to another
**observable, governed, and provenance-tracked** — the transparency mission made literal.

## The constraint

It stays **one smooth transaction** for the user — not a separate screen for every transfer.
Some single functions move data through many layers (the database especially); a screen per
transfer would be unusable. Instead, at each boundary the data's governance artifact is
surfaced **inline** — identified, easily seen, never skipped.

## The transfers

```mermaid
flowchart LR
    A[PDF bytes] -->|file_sha256| B[canonical text]
    B -->|parser id| C[OpenAI]
    C -->|model + prompt| D[present/absent slot]
    D -->|quote + page + per-piece hash| E[database]
    E -->|stored row + lineage| F[human review]
    F -->|verdict| G[verified library]
```

Each arrow is a window: the artifact named on it is what the interface surfaces at that
boundary. The SHA-256 shown the moment a PDF lands is the seed of this pattern; the whole
interface extends it to every transfer.

:::caution[Status]
The principle is established and the document fingerprint is live. The **live, animated
fingerprint-formation view** — watching the hash assemble piece by piece from the user's own
data — is designed but **not yet built**; it depends on real extraction data. See the
design record in `docs/superpowers/specs/2026-06-12-observability-spine-design.md`.
:::
