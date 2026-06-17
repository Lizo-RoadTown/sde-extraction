---
title: "ADR 0006: Astro Starlight for documentation"
description: The documentation site framework.
---

**Status:** Accepted · **Date:** 2026-06-12

## Context

The documentation needs to be a rigorous, standalone site (for regulators and standards bodies),
with the same UI shape as the Knowledge Observatory docs.

## Decision

Build it with **Astro Starlight** (the Observatory's framework), at `apps/docs/` in this repo
(docs-as-code). Structure follows Diátaxis; unfinished pages are visible but marked "Not yet
documented".

## Consequences

Built-in sidebar, search, theming, and tabs. Docs live with the code and are reviewed in the
same PRs. Deployed as a separate site, linked from the dashboard top bar.
