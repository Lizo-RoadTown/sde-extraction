# Preset: Next.js chat UI on Vercel, hooked to FastAPI deepagents

Concrete recipe for "build me a custom chat UI that lives on my website, hooked to my domain, calling my deepagents API."

## Stack

| Piece | Choice |
|-------|--------|
| Frontend host | **Vercel** |
| Frontend framework | **Next.js 14+ (App Router) with TypeScript + Tailwind** |
| API host | **Existing — `platform/api/` from this repo** (must be made public for prod; local for dev) |
| API framework | FastAPI (existing — not changing) |
| Database host | Existing — `platform/postgres` (no DB calls from frontend; agent owns the DB) |
| Auth | None (public chat) |
| Domain wiring | **Subdomain** (e.g., `chat.example.com`) via Vercel DNS |
| Aesthetic | **chainlit-inspired** — chat bubbles, streaming dots, dark mode, code blocks with syntax highlighting |

## Files this scaffolds

```
web/
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── .env.local.example                ← NEXT_PUBLIC_AGENT_URL
├── vercel.json                        ← Vercel project config
├── RUNBOOK.md                         ← dev, build, deploy, DNS
├── app/
│   ├── layout.tsx                     ← root layout, dark mode
│   ├── globals.css
│   └── page.tsx                       ← the chat page (single page app)
├── components/
│   ├── Chat.tsx                       ← message list + composer + streaming logic
│   ├── MessageBubble.tsx              ← user/agent bubble with markdown
│   ├── Composer.tsx                   ← textarea + send button
│   ├── ThinkingDots.tsx               ← chainlit-style typing indicator
│   └── ThreadSidebar.tsx              ← list of past thread_ids (localStorage-backed)
└── lib/
    ├── agent-client.ts                ← fetch wrapper for /chat/stream (SSE parsing)
    └── threads.ts                     ← localStorage thread persistence
```

## Required env vars

| Var | Where | Value |
|-----|-------|-------|
| `NEXT_PUBLIC_AGENT_URL` | local dev | `http://localhost:8001` |
| `NEXT_PUBLIC_AGENT_URL` | production | `https://agent.example.com` (the public FastAPI URL) |

## Pre-flight (must answer before deploy)

1. **What domain?** e.g., `chat.lizosborn.com`. (Local dev works without this.)
2. **DNS provider?** If domain is *also* on Vercel, easiest. Otherwise: Cloudflare / Squarespace / GoDaddy / etc.
3. **Where is the FastAPI agent going to be public?** Currently it's only on `localhost:8001`. Options:
   - **Render** — drop in your `docker-compose.yml`, ~5min setup, ~$7/month for a small instance
   - **Fly.io** — Docker-native, persistent volumes, generous free tier
   - **Railway** — simplest UI, free tier with limits
   - **Skip prod for now** — develop the UI locally only, defer agent hosting

## Steps

### 1. Local dev (against local agent)

```bash
cd web/
npm install
cp .env.local.example .env.local
# .env.local: NEXT_PUBLIC_AGENT_URL=http://localhost:8001
npm run dev
# visit http://localhost:3000 — talks to your Docker-Compose'd FastAPI on :8001
```

Agent must be running (`docker compose up -d` from `platform/deploy/`).

### 2. Deploy agent publicly (do this when ready for prod, not before)

Pick one of Render/Fly/Railway. The current `platform/deploy/docker-compose.yml` ports more or less directly to all of them. Get a public HTTPS URL out of it (e.g., `https://make-skills-agent.onrender.com`).

### 3. Deploy UI to Vercel

```bash
cd web/
npm install -g vercel       # one-time
vercel link                 # connects this folder to a Vercel project
vercel --prod               # deploys
```

Then in the Vercel dashboard → project → Settings → Environment Variables: set `NEXT_PUBLIC_AGENT_URL` to your public agent URL. Redeploy.

### 4. Wire the custom domain

Vercel dashboard → Domains → add `chat.example.com`. Vercel shows the DNS record to create:
- If your domain is on Vercel: it auto-configures
- If on Cloudflare: add a CNAME `chat → cname.vercel-dns.com`, set proxy to "DNS only" (gray cloud)
- If on another provider: same CNAME, follow their UI

SSL is automatic via Vercel.

## Aesthetic — borrowed from chainlit

Specific choices to mirror chainlit's feel:

- **Layout:** centered column max-width ~768px, sidebar collapsible on mobile
- **Bubbles:** user-aligned right with subtle background, agent-aligned left with avatar circle
- **Typography:** Inter or system sans-serif, generous line-height
- **Streaming:** new tokens append in real-time; show `ThinkingDots` while agent is thinking but no tokens yet
- **Markdown:** rendered in agent messages with `react-markdown` + `rehype-highlight` for code blocks
- **Dark mode:** default (matches chainlit's default look), toggleable via `next-themes`
- **Threads:** sidebar lists thread_ids with first-message preview; click to switch

## Streaming protocol (matches `platform/api/main.py`)

The Next.js client posts to `/chat/stream` and parses Server-Sent Events:

```
data: {"event":"thread","thread_id":"..."}
data: {"event":"chunk","data":"hello "}
data: {"event":"chunk","data":"world"}
data: {"event":"done"}
```

`lib/agent-client.ts` is the single integration point — if the API's stream shape changes, fix it here.

## Troubleshooting

- **"Failed to fetch" in browser console** — agent URL not reachable. For prod: check the agent service is up at the public URL. For dev: check `docker compose ps` and that `:8001` maps to host.
- **CORS error** — FastAPI needs `CORSMiddleware` allowing the Vercel origin. (Already permissive for `localhost:3000`; tighten for prod.)
- **Domain not resolving after Vercel setup** — DNS propagation can take an hour; check with `dig chat.example.com` or [whatsmydns.net](https://www.whatsmydns.net).
