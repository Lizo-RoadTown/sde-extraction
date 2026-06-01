# How to add a new preset

Presets capture a specific, reusable stack combination so the same kind of "I want X stack with Y piping" request becomes one-shot the second time.

## When to add a preset

After you've executed the decision loop in `SKILL.md` for a stack and it worked. If the same combination might come up again, save it.

## Naming

`preset-<frontend-host>-<framework>-<purpose>.md`. Examples:

- `preset-nextjs-vercel-chat-ui.md`
- `preset-astro-cloudflare-blog.md`
- `preset-streamlit-modal-dashboard.md`

## Required sections

Every preset has:

1. **Stack table** — every decision from the SKILL.md decision loop, filled in
2. **Files this scaffolds** — exact directory layout the scaffold will produce
3. **Required env vars** — table of var name, where it's set, what it's set to (dev vs prod)
4. **Pre-flight** — questions that block deploy (domain, DNS, public API URL, etc.)
5. **Steps** — numbered, copy-pasteable commands for: local dev, deploy agent, deploy UI, wire domain
6. **Aesthetic notes** — explicit aesthetic choices if they're load-bearing
7. **Troubleshooting** — the failures you hit, in plain language

## What to leave out

- Generic explanations of what Next.js / Vercel / etc. ARE — assume the reader knows
- Marketing language
- Future-tense "could also" suggestions — make a *new* preset for those instead

## When to update vs. add

- **Update** — the existing preset's choices changed slightly (e.g., framework version bumped, new env var added)
- **Add new** — a meaningfully different combination (e.g., adding auth, swapping host, different aesthetic)

If you're tempted to add `## With auth` and `## Without auth` sections to one preset, split into two presets.

## Cross-references

If presets share boilerplate (e.g., "how to wire a Vercel custom domain"), extract the shared piece into a sibling reference file (`references/wire-vercel-domain.md`) and link from each preset. Don't duplicate.
