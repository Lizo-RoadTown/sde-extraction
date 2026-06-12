---
title: Reading this documentation
description: How this documentation is organized, and what its status markers mean.
---

This documentation follows the [Diátaxis](https://diataxis.fr/) framework: every page is
exactly one of four kinds, so you always know what a page is *for*.

| Section | You are… | A page gives you |
|---|---|---|
| **Explanation** | trying to understand | the reasoning behind the method |
| **Reference** | looking something up | exact, exhaustive definitions |
| **How-to** | pursuing a goal | a recipe to accomplish a task |
| **Tutorials** | learning by doing | a guided first walk-through |
| **Decisions (ADRs)** | asking *why this way* | the record of a load-bearing choice |

## The status markers — what is, and what is not yet

This is a deliberately **honest skeleton**. The full intended scope is visible in the
sidebar, but a page is only written when the capability behind it is real and verified.
Two markers tell you where you are:

- A page with content is **substantiated**: it describes something that exists in the system
  today, and it cites where.
- A page marked **“Not yet documented”** names a planned capability that is **not yet
  verified**. It is intentionally empty of claims. It will be filled when the underlying
  work is done — not before.

This mirrors the method itself: the extraction records a value only when the paper states
it, and marks it *absent* otherwise. The documentation holds itself to the same rule — it
states something only when the system substantiates it, and marks it *not yet* otherwise.
Nothing here is invented to fill space.

## How to start

- To understand the method, begin with [the document-architecture canon](/explanation/canon/).
- To run the system, see [How-to → Run the extraction worker](/how-to/run-worker/).
- To audit the choices, read the [Decisions](/decisions/) (ADRs).
