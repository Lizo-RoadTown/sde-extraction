# Proposal — tech stack for the spotlight/searchlight extraction animation

**Status:** PROPOSED — awaiting Liz's approval before any build.
**Date:** 2026-06-12
**Author:** Claude Opus 4.8 (Claude Code), grounded in two parallel research agents (web-cited).
**Surface:** runtime — `apps/dashboard/` (the verifier's fingerprint visual).
**Supersedes:** the hand-rolled `PdfQuest` spotlight (uncommitted, parked) — which used a live-animated
`backdrop-filter` mask, i.e. the documented jank pitfall (#1 below).

## The effect (agreed with Liz)

The paper's real PDF page darkens like a movie scene and goes slightly blurred. A bright, soft-edged
**spotlight / magnifying-glass** glides across it — *searching*, up here then down there — and only what's
under the light is sharp and bright. It lands on each value the figure required (a real **present** slot),
and that value's **SHA-256 resolves in the light**, folding into the extraction fingerprint. Things it
can't find are real **misses** (absent slots). The run ends **successful** or **failed** — the figure's
real `outcome`. It auto-plays, is skippable/replayable, and respects reduced-motion.

Honesty rule (load-bearing): it is a **replay of a real extraction that already ran** — the lens lands
only on items the run actually found, with no more confidence than was real. The searchlight is the
interpretive layer; the find / quote / hash / verdict are literal.

## Decision (recommended stack)

**Substrate: pure CSS/DOM** — two stacked copies of the page (a sharp one, and a copy with blur+darken
**baked in once**), with a `radial-gradient` **`mask`** punching the spotlight hole in the dark copy so the
sharp page shows through under the lens. **Never animate `backdrop-filter` or blur per frame** — only the
mask's center moves.

**Motion driver: GSAP 3.13** (`gsap` + `@gsap/react`). Frame-accurate timeline (glide → anticipate →
land → resolve value+hash → glide on), native pause / replay / seek, `gsap.matchMedia()` for
reduced-motion. It tweens CSS custom properties (`--lx`, `--ly`, `--r`) that the mask reads. ~23 KB gz,
now fully free (Webflow, 2025), React 19-clean. **No WebGL / Pixi / three, no per-frame canvas blur.**

Real `pdf.js` text layer stays underneath (already rendered) to look up each quote's **real rectangle**,
so the lens lands on the true location; coordinates derive from the single viewport scale pdf.js rendered
at (mixing scales is the drift bug).

### Why this and not the alternatives
| Substrate | Smoothness | Perf | Complexity | Verdict |
|---|---|---|---|---|
| **CSS mask + pre-blurred layer + GSAP** | High (only mask center animates) | Low (blur baked once) | Low | **Chosen** |
| Canvas 2D live blur | Poor (`ctx.filter` blur is software: ~1–5 fps full-page) | Very high | Medium | Rejected |
| WebGL shader (Pixi/r3f) | Highest | Low GPU, high fixed cost | High | Overkill for a static page |
| Live `backdrop-filter` mask (my parked draft) | Janky (repaint storm) | High | Low | **Rejected — the pitfall** |

## Architecture (layers, bottom→top)
```
wrapper (relative; sized to the pdf.js page viewport)
├─ L0  <canvas>  pdf.js page — SHARP original (honest, always there)
├─ L1  text layer — real spans → quote rectangles (lookup only)
├─ L2  dark+blur copy of the page (filter baked ONCE: blur ~6px brightness ~0.4),
│        mask-image: radial-gradient(circle var(--r) at var(--lx) var(--ly),
│                     transparent 0, transparent 70%, black 100%)   (+ -webkit-)
│        → cut away inside the lens, revealing sharp L0; covers outside.
│        will-change: mask; its own composited layer.
└─ L3  lens ring (the magnifier rim) + the resolved value/hash chip at the quote rect
```
GSAP tweens `--lx/--ly/--r` along a timeline keyed to the real quote rects. Reduced-motion branch
(`gsap.matchMedia`): no glide — jump-cut between finds, cross-fade reveals <200ms (static by default,
glide only under `@media (prefers-reduced-motion: no-preference)`).

## Tuning spec (starting values, from the motion-design research)
- **Lens diameter:** ~20–32% of the page's shorter side (hug the found value + small margin); dark field dominates.
- **Edge:** sharp bright core → feathered falloff over the outer ~30–40% of radius. **Never a hard circle** (that's the cheap tell).
- **Surround:** ~40–50% black, **never pure black**; blur ~4–8px (context legible as shape).
- **Glide:** ~400–800ms per leg, scaled to distance, **ease-in-out or near-critical spring** (stiffness ~150–200, damping ~20–30) along a gentle **arc**. **Never linear** (reads robotic).
- **Land:** ~60–100ms anticipation dip, then single overshoot-and-settle (~150–250ms).
- **Reveal:** value+hash 200–300ms ease-out entrance; **dwell ~1–2.5s, varied per find**; exit ~200ms.
- **Total:** budget ~8–12s for 3–4 finds → **Skip + Replay mandatory** (anything un-skippable past ~5s is an anti-pattern).
- **Perf:** animate transform/opacity + the mask only; 60fps; interruptible (retargets, never snaps).

## Honesty constraints (non-negotiable)
1. Land only on slots the **real run found**; never the same canned choreography on a different result (don't "find" on an empty extraction).
2. Frame it explicitly as a **replay/reconstruction**, not live machine cognition.
3. Don't animate more certainty than the extraction had.
4. The dramatized lens sits over an **inspectable literal record** (the real value, hash, page) the user can open.

## Scope / plan once approved
1. Add `gsap` + `@gsap/react` (one dependency).
2. Build `SpotlightQuest` per the layer architecture; wire the GSAP timeline to the real quote rects from the text layer; Skip/Replay/reduced-motion.
3. Validate the look with Liz; tune the spec numbers together.
4. Replace the parked `PdfQuest` draft.

## Out of scope (now)
The on-page coordinate *precision* beyond text-layer best-effort (a quote that spans line breaks may land
approximately — honest fallback: reveal in the lit area near the page top, labeled). Birds-eye relational
view, two-model orchestration, verdict-persist — separate threads.
