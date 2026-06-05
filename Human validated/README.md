# Human validated

**Everything in this folder has been reviewed, judged, and approved by Liz (a human).**

An artifact here means a person read it, checked its claims, corrected what was wrong, and stands
behind the result. It is the counterpart to [`../Agent Drafts/`](../Agent%20Drafts/), which holds
unreviewed AI output.

## What goes here

- Agent drafts that Liz has read, verified, edited, and accepted
- Original human-authored work
- Anything for which a human is accountable for the content

## The provenance rule

1. **Only Liz promotes content into this folder.** Agents and workflows must not write here —
   doing so would defeat the entire point (the folder name asserts human judgment was applied).
2. When promoting a draft from `Agent Drafts/`, keep a short note of what was validated and what
   changed — e.g. a `## Validation notes` section, or a `VALIDATION.md` beside the file. That note
   is the record of the human's contribution.
3. Prefer to keep the original draft in `Agent Drafts/` so the before/after diff survives. Git
   history then timestamps exactly when validation happened.

## Why this exists

Liz produces research results while using an LLM as a fast search-and-draft tool. Without
documentation, an outside observer can't tell how the LLM was used or where the human judgment came
in. This folder is the human-accountability layer: its contents are, by definition, things a person
checked and chose to endorse. The gap between an `Agent Drafts/` item and its `Human validated/`
version is the documented evidence of that judgment.
