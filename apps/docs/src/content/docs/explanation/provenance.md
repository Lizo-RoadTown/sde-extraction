---
title: Provenance & lineage
description: How every captured value is tied back to the exact bytes and text it came from, by hash.
---

Provenance is not a feature bolted onto this system — it is the backbone. The method's claim
is that an extracted model is *provable*, and a claim of provability requires that every
value trace, by cryptographic hash, to the source it was read from.

## Two levels of fingerprint

| Level | What is hashed | When |
|---|---|---|
| **Document** | the exact PDF bytes (`file_sha256`) | at upload, before extraction |
| **Piece** | each present slot's source quote (one SHA-256 per slot) | after extraction, by code |

The document fingerprint anchors the whole paper to an immutable identity. The per-piece
hashes anchor each *captured value* to the exact text it was transcribed from. The language
model produces the quote; the pipeline computes the hash. The model never hashes — that
separation is what keeps the lineage tamper-evident and reproducible.

## Why per-piece, not just per-document

A single document hash proves *which paper*. It does not prove *which words* a value came
from. The per-piece hashes close that gap: each value in the final model is bound to its
own slice of the source. This is also the data behind the planned
[fingerprint-formation view](/explanation/observability/) — the fingerprint shown not as a
phantom number, but assembled, piece by piece, from the user's own data.

*Source: `services/extraction/schema.py` (`checksums_for`, `Provenance`),
`apps/dashboard/src/data.ts` (`fingerprintFile`).*
