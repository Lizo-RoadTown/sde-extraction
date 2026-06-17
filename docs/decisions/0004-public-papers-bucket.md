---
title: "ADR 0004: Public papers bucket"
description: Source PDFs are publicly readable, by design.
---

**Status:** Accepted · **Date:** 2026-06-12

## Context

This is a transparency and reproducibility project: an extracted model should be traceable to
its exact source paper by anyone.

## Decision

The `papers` storage bucket is **public** (public read; authenticated write). A signed-URL path
exists and can be switched on if private storage is ever required.

## Consequences

Anyone can retrieve a source PDF to reproduce an extraction. Open item: confirm with the PI
whether any source papers are under licenses that forbid rehosting the bytes; if so, store a
DOI/hash pointer publicly instead of the PDF.
