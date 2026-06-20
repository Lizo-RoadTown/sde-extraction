---
title: Developer documentation
description: For people building and changing the system — how it is put together, the decisions behind it, and the logic for handling failures. Separate from the rest of this site, which is for people using the system.
status: draft
---

:::caution[In development]
This section is new and growing. Pages here describe how the system is built and reasoned about; some
describe intended behavior that is not finished yet — where that is true, the page says so. Never read a
page here as a promise that something is already live.
:::

The rest of this site is for **using** the system. This section is for **building and changing** it.

It is organized the same way good documentation always is — every page is exactly one of: an
**explanation** (understand *why*), a **how-to** (do a specific task), or a **reference** (look something
up). Mixing those is the main thing that makes docs confusing, so we keep them apart.

## What's here

- **Logic and decisions** — the reasoning the system is built on, and how to think about problems when
  they happen. Start with [Triaging failures across the deterministic ↔ fuzzy boundary](/dev/operations/failure-triage/).

More groups (architecture overview, decision records, contributor how-tos, reference) will be added here
as they are written. Each is added when it is real, not before.
