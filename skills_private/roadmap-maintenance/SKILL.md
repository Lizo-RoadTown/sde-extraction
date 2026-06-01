---
name: roadmap-maintenance
description: Keep ROADMAP.md current as work ships. Use the update_roadmap_status, add_roadmap_item, and roadmap_overview tools to flip statuses, add items, and check the current state. Liz amends manually whenever she wants; agent updates only when there's concrete evidence (a commit, a verified test, a user statement).
---

# Roadmap maintenance

`ROADMAP.md` at the repo root is the single source of truth for what's in progress on the Make_Skills platform. It belongs to **Pillar 2** ("Make skills together") because it's a collaborative document — agents update statuses as work ships, the user amends shape and priorities, both contribute.

## When to update

Update from the agent side when **all** of these are true:

1. The work is **actually done** (or measurably partial), not aspirational.
2. There's **evidence** the user can point at — a commit, a passing smoke test, a deployed URL, a verified result.
3. The change is **small and specific** — a status flip on an existing row, or a new item a recurring discussion clearly produced. Not large reorganizations.

Don't update for:

- Speculative or partial work that could regress
- Reframing wording on items the user authored
- Adding "future ideas" the user hasn't surfaced
- Status downgrades on items the user manually marked (treat the user's edits as authoritative)

## How to update

Three tools are wired into the agent:

| Tool | When |
|------|------|
| `roadmap_overview()` | Always call first — see current state before deciding |
| `update_roadmap_status(item_title, new_status, why)` | Existing row's status changes |
| `add_roadmap_item(section_heading, item_title, status, why)` | A new row is warranted under an existing section |

Status values: `shipped`, `partial`, `not_started`, `needs_discussion`.

The `item_title` matcher is permissive (substring + prefix). If multiple rows match, the tool returns an error and you should refine the title.

## Amending by the human

The file lives at `ROADMAP.md`. The user can:

- **Edit in VS Code** — opens the markdown directly, full power, git tracks history
- **Edit via the `/roadmap` page** — opens an in-browser textarea (the "Edit" button in the header) that round-trips through `POST /roadmap/overwrite`
- **Reorganize sections** — agent should respect new section headings and treat them as authoritative

Agent-initiated changes never overwrite content broadly — `update_roadmap_status` only modifies the second column of one row, `add_roadmap_item` only inserts after a section heading. The user's prose and structure are preserved.

## Operating discipline

- **Probe first.** Always call `roadmap_overview()` before deciding what to change.
- **One change per turn** unless the user explicitly groups them. Easier to review, easier to revert.
- **Be honest about partial progress.** "shipped" means the user can use it now without setup. "partial" means a meaningful step is in place but the item isn't end-to-end. Don't inflate.
- **Pillar 2 self-reference.** The roadmap maintenance system itself is a Pillar 2 (Make skills together) artifact — the agent updating its own roadmap IS collaborative skill-building. Cite this skill when a roadmap update is non-obvious.

## Surface in the UI

The `/roadmap` page in `web/` renders the markdown live. After an agent update, the user can refresh the page to see the change immediately. The page lives logically under Pillar 2 ("Make skills together") in the future site nav at `/skills/roadmap`; for now it's at `/roadmap`.

## On cloud-hosted (Render) writes

When the api runs on Render, there's no volume mount of the repo — `ROADMAP.md` lives at `/app/ROADMAP.md` baked into the image. Writes succeed in the running container but are **lost on next deploy** unless committed back to git. A future enhancement is git-commit-from-container; for now, agent updates from a cloud-hosted instance should be considered ephemeral, and significant updates should be made from the local stack (where the volume mount makes them durable on the host).

## Pair with the public stack

This skill is mostly self-contained, but two public skills help when the roadmap update is part of broader motion:

- **`antigravity-bundle-essentials:concise-planning`** — when an update reflects "we just decided to do A first, then B, then park C"
- **`antigravity-bundle-oss-maintainer:commit`** — for the commit that captures the roadmap edit (especially when running from a local stack with durable writes)
