---
name: intake-web-app-scaffold
applies_to_skill: web-app-scaffold
trigger_phrases:
  - "I want it on my website"
  - "hook this up to my domain"
  - "live on the internet"
  - "like I do with my other things"
  - "build me a chat UI / dashboard / front-end"
  - "stack X with Y, deployed Z"
---

# Intake — web app scaffold

Loaded by the [`web-app-scaffold`](SKILL.md) skill when a request matches one of the trigger phrases. Skips the asking-questions step by codifying what to probe / assume / actually ask / save.

## Probe (do these before deciding anything)

| Command / file | What it tells you |
|----------------|-------------------|
| `find . -maxdepth 3 -name package.json -not -path '*/node_modules/*'` | Existing Next.js / Astro / etc. projects in the workspace |
| `vercel whoami` | Is Vercel CLI authenticated? Returns username on success, error on miss |
| `vercel domains ls` (if authed) | Custom domains already on the user's Vercel account |
| `gh auth status` | GitHub auth state — needed if pushing the new web/ subfolder needs a fresh repo |
| `node --version` && `npm --version` | Tooling presence (Node 18+ required for Next 14) |
| `cat platform/api/main.py` (if exists) | What endpoints does the existing API speak? |
| `~/.claude/projects/<repo>/memory/` | Captured user preferences, prior project decisions |

## Defaults (assume unless probe disconfirms)

| Field | Default | Disconfirm if |
|-------|---------|---------------|
| Frontend host | **Vercel** | User's other sites are on Netlify / Cloudflare / different |
| Framework | **Next.js 14, App Router, TypeScript, Tailwind, no src/, no eslint** | Existing project uses something else |
| Folder | `web/` at repo root | Folder exists with unrelated content — pick `chat-ui/` or similar |
| API integration | Existing `platform/api/` (FastAPI), `/chat/stream` SSE endpoint | No existing API — REAL blocker, escalate |
| Aesthetic | **chainlit-inspired** (chat bubbles, streaming dots, dark mode default, code blocks with syntax highlighting) | Memory says otherwise |
| Auth | none | Request mentions auth |
| Domain (dev) | `localhost:3000` | n/a |
| Domain (prod) | Vercel-generated subdomain | User-named domain found in `vercel domains ls` or memory |
| Deploy on first run | **Yes, to Vercel preview** | `vercel whoami` fails (stop condition below) |
| Streaming protocol | SSE matching `platform/api/main.py` shape (`event: thread / chunk / done`) | API uses something else — adapt the client |

## Genuinely needs user input

These are the ONLY things to ask. Probing can't answer them.

| Field | Ask only if | Fallback if user defers |
|-------|-------------|-------------------------|
| Custom domain name | User says "my domain" but probe finds NO matching domain in `vercel domains ls` | Ship to Vercel-generated URL, note the manual DNS step in report |
| DNS provider credentials | Never — DNS records the user adds in their registrar UI themselves | Provide the exact CNAME record to add |
| Paid Vercel features (Pro tier, paid analytics) | Only if explicitly asked | Use free tier |
| Make repo public/private if creating new repo | If creating one for this UI separately | Default to private |

## Capture to memory after success

| What | Where | Why |
|------|-------|-----|
| Vercel team / account used | `user_vercel_account.md` | Default for next deploy |
| Domain attached (if custom) | `project_<repo>.md` | Default for related deploys |
| Non-default decisions | `feedback_*.md` if it reflects a preference | Bias future runs |
| Project name in Vercel | `project_<repo>.md` | `vercel link --yes` works without prompting next time |

## Stop conditions specific to this topic

- `vercel whoami` fails → finish scaffolding + local test, stop before deploy. Report: "Vercel auth needed — run `vercel login` and tell me to continue."
- API at expected URL not reachable from the UI → finish scaffolding, stop before claiming success. Report: "API at `<url>` unreachable — start it (`docker compose up -d` from `platform/deploy/`) or give me a public URL."
- Existing folder collision at `web/` with unrelated content → use `chat-ui/` or similar, note the rename in report.
- Vercel project would auto-create a paid tier resource (e.g., team-only feature on personal account) → don't.

## Cross-references

- Parent skill: [SKILL.md](SKILL.md)
- Reference recipe (concrete file list + aesthetic): [references/preset-nextjs-vercel-chat-ui.md](references/preset-nextjs-vercel-chat-ui.md)
- Schema source: [`lessons-learned/SKILL.md`](../lessons-learned/SKILL.md) — this file follows that schema
