---
title: Confidence & telemetry
description: How earned confidence is computed from telemetry layers and human feedback.
---

:::caution[Not yet documented]
The confidence layer is **designed but not yet implemented**. This page will describe the
real telemetry layers, how governance and provenance are captured for each, and how a
confidence score is computed from telemetry plus human feedback — once that capability is
built and verified. It is intentionally left without claims until then.
:::

## What is decided

The shape is settled: confidence is **earned, not assigned**, and **granular** — tracked per
extractor, per independent dimension (model type, figure type, and others discovered as
documents are processed), as a vector rather than a single blended score. A human
verification is the signal that raises or lowers it.

## What is open

The update rule, the exact telemetry layers and their per-layer sub-scores, the schema that
stores them, and how confidence drives triage / routing / queue order — all under review.
See the design record `Agent Drafts/sde-extraction-approach/2026-06-11-confidence-and-tagging.md`.
