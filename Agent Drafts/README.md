# Agent Drafts

**Everything in this folder is AI-generated or AI-assisted output that has NOT yet been validated by a human.**

This folder exists to make the division of labor explicit and auditable. When Liz works with an
LLM (Claude Code), the LLM acts as a fast retrieval-and-drafting tool — it searches, summarizes,
and produces first drafts. None of that is authoritative until a human reviews it.

## What goes here

- Research syntheses produced by agents / research workflows
- First-draft schemas, code, docs, plans
- Anything an LLM wrote that a person has not yet checked line by line

## The provenance rule

1. **Agents and workflows write here, never into [`../Human validated/`](../Human%20validated/).**
2. Each artifact carries a provenance header (who/what generated it, when, from what input,
   and that human validation is pending).
3. When Liz reviews an artifact — reading it, checking claims, correcting, editing, or rejecting —
   the validated result is created in [`../Human validated/`](../Human%20validated/), with a note
   on what changed and what she confirmed.
4. An item in `Human validated/` therefore means *a human read it, judged it, and stands behind it.*
   An item here means *not yet.*

## Why this exists

Conversations with an LLM are not normally documented, so Liz's intellectual involvement — the
questioning, the direction-setting, the judgment about what is right — is invisible to anyone
looking only at results. This folder + its `Human validated/` counterpart + git history make that
involvement legible: the draft shows what the tool produced; the validated version shows what the
human decided; the diff between them is the evidence of the human's contribution.
