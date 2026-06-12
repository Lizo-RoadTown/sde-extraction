---
title: The three pillars
description: The canon, the human-in-the-loop queue, and earned confidence — how the method extracts, verifies, and learns whom to trust.
---

The method rests on three pillars. The first two are built; the third is designed.

## 1. The canon — *how we extract*

Constrain the document, force present-or-absent, let absence hold. This is what makes an
extraction provable rather than plausible. See [the canon](/explanation/canon/).

## 2. The human-in-the-loop queue — *how we verify*

Every extraction is reviewed by a human before it is trusted. The machine clears what is
provable (schema, lineage, figure reproduction) and escalates only what needs human eyes.
The human's verdict — and each per-slot correction — is recorded as an audit trail.

## 3. Confidence — *how we learn whom to trust*

Each human verification is also a signal. Tagged by independent dimensions (model type,
figure type, and more), it raises or lowers an extractor's **earned confidence** on that
kind of document. Confidence is never assigned; it accrues from outcomes.

:::caution[Status]
Pillars 1 and 2 are built and operating. **Pillar 3 (confidence) is under review** — the
scoring mechanism and its telemetry are designed but not yet implemented. See
[Reference → Confidence & telemetry](/reference/confidence/).
:::
