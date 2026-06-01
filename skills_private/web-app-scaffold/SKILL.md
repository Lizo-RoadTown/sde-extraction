---
name: web-app-scaffold
description: Agentic scaffolder for deployable web apps. Probes context, decides the stack with defensible defaults, executes the build, deploys where authorized, and reports. Use when the user wants a chat UI / dashboard / front-end "on my website" / "live" / "hooked to my domain". Don't ask permission for routine choices — make them and own them.
---

# Web app scaffold (agentic)

For "I want stack X piped Y, deployed Z" — and any variant ("hook this up to my website", "make it live", "like I do with my other things").

**Operate as PROBE → DECIDE → ACT → REPORT. Not as a checklist for the user.**

## 1. Probe (always, first)

Read context before deciding anything. Don't ask what you can read.

| What to probe | How |
|---------------|-----|
| Existing frontend | `find . -maxdepth 3 -name package.json -not -path '*/node_modules/*'` — any Next.js / Astro / etc? |
| Existing API | What's at `platform/api/` ? what protocol? what port? |
| Authenticated tools | `vercel whoami`, `gh auth status`, `npm --version`, `node --version`, `docker --version` |
| User's existing domains | `vercel domains ls 2>/dev/null` if Vercel is authed |
| Memory | `~/.claude/projects/.../memory/` — any captured preferences from prior runs? |
| Stack presets | [`references/`](references/) — does any preset match the request? |
| Repo conventions | Check root README, `.vscode/settings.json`, existing folder layout — what's the repo's style? |

## 2. Decide (defaults, with reasoning recorded)

Apply these defaults unless the probe disconfirms them. Document the reason in the final report — not as a question to the user.

| Decision | Default | Disconfirm if |
|----------|---------|---------------|
| Frontend host | **Vercel** | Probe shows user uses different host for everything else |
| Frontend framework | **Next.js 14, App Router, TypeScript, Tailwind** | Existing project uses something else and we should match it |
| Folder | `web/` at repo root | Existing folder by that name — pick `web2/`, `chat-ui/`, etc. |
| API integration | Existing `platform/api/` over network | No existing API — note that as a real blocker |
| Domain | Vercel-generated subdomain | User-named domain in memory or `vercel domains ls` output |
| Aesthetic | **chainlit-inspired** (chat bubbles, streaming, dark mode, code highlighting) | Memory says otherwise |
| Auth | none | Request mentions auth |
| Deploy on first run? | **Yes, to Vercel preview** if `vercel whoami` succeeds; else stop at scaffold + local test | Stop conditions below |

## 3. Act (run the work, don't write runbooks)

Do this in order. Stop only at the listed stop conditions — not for "are you sure?"

1. Scaffold: `npx create-next-app@latest <folder> --typescript --tailwind --app --no-src-dir --import-alias "@/*" --no-eslint --use-npm --skip-install`
2. `npm install` in the folder
3. Generate the chat code (see preset for files — components, lib, env example)
4. Add `.env.local` with `NEXT_PUBLIC_AGENT_URL=http://localhost:8001` for dev
5. Verify dev: start `next dev`, hit `http://localhost:3000`, confirm it loads. Kill the server.
6. Configure Vercel: `vercel link --yes` (if authed)
7. Set env: `vercel env add NEXT_PUBLIC_AGENT_URL preview` then `production`
8. Deploy preview: `vercel deploy` → record URL
9. Run smoke test against the preview URL (curl the page, check 200)

## 4. Stop conditions (these are the ONLY stops)

- `vercel whoami` fails → stop after step 5 (scaffold + local test work). Report: "Vercel auth needed — run `vercel login` and tell me to continue."
- API isn't reachable from the scaffolded UI → stop after step 5. Report: "API at `<url>` not reachable. Either start it or give me a public URL."
- Custom domain requested but user can't be queried for DNS access → ship to Vercel-generated URL, report the manual DNS steps as ONE next-action.
- Cost-incurring tier change (e.g., enabling Vercel Pro features) → don't.
- Existing project would be overwritten → use a different folder name and note in report.

## 5. Report (always, single message at end)

```
Built: <one-line description>
Live at: <URL or "local only — Vercel auth needed">
Code at: <path>

Decisions made:
- <decision>: <chose X because Y> (only mention non-defaults)

Not yet wired:
- <thing>: <one-line action to do it>

Next: <ONE concrete action OR "nothing — it's done">
```

No checklists. No "want me to do X?" — if X is the obvious next step, just record it as a Next.

## 6. Memory loop

After successful run, append a short note to `~/.claude/projects/.../memory/` if you learned something durable:

- A new preset worth saving: write to `references/preset-<name>.md`
- A user preference that should bias future runs: append to `feedback_*.md` or `user_preferences.md`
- A domain mapping discovered: save to `project_<repo>.md`

Goal: the SECOND invocation should make even fewer decisions because the FIRST taught the system.

## Presets

Concrete stack recipes in [`references/`](references/). Match the request to a preset and skip the decide step entirely:

- [preset-nextjs-vercel-chat-ui.md](references/preset-nextjs-vercel-chat-ui.md) — Next.js + Vercel chat UI calling existing FastAPI agent. Chainlit-inspired aesthetic.

Adding new presets: [how-to-add-presets.md](references/how-to-add-presets.md).

## See also

- [`agentic-skill-design`](../agentic-skill-design/) — the meta-pattern this skill follows. Read it when designing OTHER agentic skills.
- [`skills/_upstream/anthropics-skills/skills/skill-creator/`](../_upstream/anthropics-skills/skills/skill-creator/) — Anthropic's skill-authoring guide. Use when formalizing a wholly new pattern.
- [`skills/_upstream/anthropics-skills/skills/frontend-design/`](../_upstream/anthropics-skills/skills/frontend-design/) — frontend aesthetic and component guidance, complementary to this skill.

## Pair with the public stack

The agentic *behavior* (PROBE → DECIDE → ACT → REPORT, chainlit defaults, deploy-on-first-run) is this skill's contribution. Current framework specifics and code-level operations are better delegated:

- **`antigravity-bundle-web-wizard:nextjs-best-practices`** — current Next.js patterns (Next.js 16 has breaking changes — defer to this for App Router specifics)
- **`antigravity-bundle-web-wizard:tailwind-patterns`** — current Tailwind v4 patterns (`@theme inline`, design tokens)
- **`antigravity-bundle-web-wizard:react-patterns`** + **`react-best-practices`** — React 19 patterns
- **`antigravity-bundle-typescript-javascript:nextjs-app-router-patterns`** — App Router data-fetching and Server Components
- **`agent-sdk-dev:new-sdk-app`** — when the scaffold needs an Agent SDK backend, not just FastAPI
- **`figma:figma-implement-design`** — when the scaffold target is a specific Figma design
- **`superpowers:verification-before-completion`** — required before reporting "deployed"; run the dev server and confirm the golden path in a browser
- **Serena MCP** (when installed) — for cross-file renames and symbol-level edits during scaffold customization, instead of grep + read patterns
- **`verify`** (skill) — run the app and observe the change, not just `npm run build`
