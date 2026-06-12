# UX Contract — SDE Extraction dashboard

The design discipline every user-facing surface in the SDE Extraction dashboard must follow. This
is the gate every UI change passes through. If a change can't be defended against this document, it
doesn't ship.

Adapted from `web-project-starter`'s `UX_CONTRACT.md` for this project. The universal rules are kept;
the project-specific sections are written around the actual surfaces (Intake, Process, Verify,
Library) and the document-architecture canon.

---

## Rule zero — the master contract

**Attention → Question → Commitment → Feedback → Reveal.**

The verifier must commit to a present/absent judgment before the system reveals the next thing. No
auto-advance through the escalation queue; no "approve all" that skips the per-slot decision.

For this dashboard the protagonist is the **human verifier** (the role the AT3_review Reviewer 2
plays today). Every surface serves their judgment, not the database.

---

## The canon IS the core interaction

This project's one governing idea — *constrain the document; force present/absent; absence holds* —
is also the dashboard's central UX rule. It maps directly onto the universal "empty vs filled"
pattern:

- **Present** = a filled card: the verbatim value, its meaning, the source quote, page, and lineage
  hash. Renders solid, with a subtle entry ("fill-pop").
- **Absent** = a first-class state, NOT an empty hole: a clearly-marked "absent" with its reason
  (`not_stated` / `requires_inference`). Renders distinct from present — never blank, never the same
  as "not yet reviewed."

The difference between *present*, *absent*, and *not-yet-judged* must always be visually unambiguous.
If a slot looks the same whether it was judged absent or simply skipped, that is a contract violation —
it destroys the verifier's feedback loop and quietly reintroduces the hallucination the canon exists
to prevent.

Source of truth for the data shape: `src/types.ts` (`Slot` = present | absent). Renderer: `SlotView`
in `src/ui.tsx`.

---

## Two-language coherence

When the verifier commits to a slot, the paired representation updates at the same time. The Verify
surface is built around this and must honor it:

- **Slot decision ↔ source.** Each present/absent judgment pairs with the PDF source it came from
  (jump-to-source highlight on the quoted span). A judgment with no visible source is incomplete.
- **Captured values ↔ figure.** The figure-compare pane (paper vs. regenerated) is the verification
  oracle. Changing what's captured should visibly change the regenerated side.

Where a paired representation is still a stub (the PDF and figure panes are placeholders today), say so
on the surface — a labeled "not built yet" beats a silent blank that reads as broken.

---

## Color semantics — six tokens, one meaning each

Defined once in `src/index.css` under `@theme`, consumed via the `badgeTones`/`statTone` maps in
`src/ui.tsx`. Do not introduce raw hex or new hues in components — map new states onto an existing
semantic.

| Meaning | Token family | Used for |
|---|---|---|
| Present / correct / live | `present` (emerald) | a stated, verified value |
| Absent / not-stated | `absent` (slate) | the canon's first-class "no" |
| Attention / suboptimal | `attention` (amber) | needs-human, requires_inference, warnings |
| Active / pivot | `active` (cyan) | current selection, focus accent |
| Invalid | `invalid` (red) | hard constraint violation, block |
| Lineage | `lineage` (violet) | provenance / hash highlights |

Plus surface/text tokens: `surface`, `surface-raised`, `edge`, `ink`, `ink-dim`, `ink-faint`.

---

## Navigation — one place per concern

- **One nav item per concern.** The four surfaces (Intake / Process / Verify / Library) each answer one
  question. Don't split a concern across pages; don't add a fifth stub.
- **The sidebar is not a TODO list.** No "coming soon" nav items — build the surface or leave it out.
- **Every surface feels like the same product.** Header chrome, tokens, spacing, transitions match.

---

## Voice and tone

- Describe what *is*. No marketing language, no "delightful/powerful/seamless," no self-congratulation.
- Match the repo's plain, direct house style (same rule as CLAUDE.md).
- "Absent" is never framed as failure — in this product, a correct "absent" is a successful extraction.

---

## Accessibility — non-negotiable

- **Contrast ≥ 4.5:1** for body text on dark surfaces; ≥ 3:1 for large/secondary. Verify the token
  pairs (e.g. `ink-faint` on `surface-raised`) against a real checker — dark mode is easy to get wrong.
- **Visible focus rings** on every interactive element (the present/absent buttons, escalation list,
  selects). Never `outline-none` without a replacement.
- **Color is not the only signal.** Present/absent must also carry text/icon, not just green vs amber —
  this is doubly important here because the whole UI is a color-coded judgment.
- **Keyboard nav** matches visual order; the slot decision controls are reachable and operable.
- **`prefers-reduced-motion`** respected; the fill-pop and pulses reduce/disable on request.

---

## Animation budget

- 150–300ms for state changes; `transform`/`opacity` only (never width/height).
- Motion conveys meaning: a slot committing to present "fills"; an escalation clearing leaves the queue.
- No decorative-only animation. The live-status pulse is meaningful (engine alive) and must respect
  reduced-motion.

---

## Anti-patterns — refuse if asked

- **CRUD-form framing.** The surfaces are a guided verification journey, not a table with an "Add" button.
- **Absent rendered as blank.** Absent is a decision with a reason; it must look like one.
- **Same look for judged-absent vs not-yet-judged.** Destroys the feedback loop; reintroduces the
  hallucination risk the canon prevents.
- **Approve-all that skips per-slot commitment.** Violates rule zero.
- **Stub nav items / placeholder panes shipped as if done.** Label stubs explicitly (the PDF + figure
  panes today) or build them.
- **Raw hex / new hues in components.** Map onto the six semantics.

---

## Review checklist — every UI change passes

1. Does the verifier commit (present/absent) before the system reveals/advances?
2. Are present / absent / not-yet-judged visually unambiguous?
3. Is each judgment paired with its source (or the gap named)?
4. Color semantics consistent with the six tokens — no raw hex?
5. Animations purposeful, within budget, reduced-motion respected?
6. Accessibility: contrast, focus rings, color-not-only, keyboard nav?
7. Voice plain — no marketing, "absent" never framed as failure?
8. Sidebar gains no new stub; placeholder panes labeled as such?

If any item is "no," fix it or name the exception explicitly in the change.

---

## Where this lives operationally

- This document is canonical for the dashboard. UI changes cite which sections they comply with.
- Tokens live in `src/index.css`; the component kit (`src/ui.tsx`) is the only place tones map to
  classes. Evolve the design here and in those two files, deliberately — not ad hoc per component.
- Adapted from `web-project-starter/templates/ui-app/docs/UX_CONTRACT.md` (2026-06-08).
