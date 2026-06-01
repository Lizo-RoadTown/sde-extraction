# `.project-intelligence/` — SDE_Extraction's instance state

Per the three-layer model (see `the-loom/docs/architecture/2026-05-31-five-module-platform.md` § Module 4), the recursive skill-making engine is structured as:

- **Reusable core engine** → lives in `Lizo-RoadTown/Make_Skills`
- **Project-type adapters** → live in `Make_Skills/adapters/<type>/`
- **Project-local instance state** → lives HERE

SDE_Extraction has **two instances** pre-laid (mirroring the Summer 2026 Hub pattern), though only the dev/research instance is active today:

```text
.project-intelligence/
├── instances.json                   Canonical manifest (lists both)
├── README.md                        This file
├── sde-extraction-dev/              ACTIVE — researcher + developer-facing
│   ├── project-type.json
│   ├── attached-adapters.json
│   ├── agent-profile.json
│   ├── project-context.json
│   ├── observatory-config.json
│   ├── local-skill-candidates/
│   ├── workflow-candidates/
│   ├── promotion-candidates/
│   └── lessons-learned/
└── sde-extraction-app/              PLACEHOLDER — activates when deployed app is built
    ├── project-type.json            (PLACEHOLDER — stub configs marked as such)
    ├── attached-adapters.json       (PLACEHOLDER)
    ├── agent-profile.json           (PLACEHOLDER)
    ├── project-context.json         (PLACEHOLDER)
    ├── observatory-config.json      (PLACEHOLDER)
    ├── local-skill-candidates/
    ├── workflow-candidates/
    ├── promotion-candidates/
    └── lessons-learned/
```

## How an agent picking up this repo should orient

1. **You ARE `sde-extraction-dev`** — the researcher/developer-facing instance (the active one).
2. Your LOOM_PROJECT_ID is `sde-extraction-dev`.
3. Tag all `memory_recall` / `memory_write` with `project_tags=["sde-extraction-dev"]`.
4. Read your config from `.project-intelligence/sde-extraction-dev/`.
5. **Do NOT read from or write to `sde-extraction-app`** — that instance's memory is the deployed product's, separate from yours, even though that instance isn't yet active.
6. The methodology skills you'll lean on most for research-heavy work: `skills/deep-research-pattern`, `skills/eval-deep-research`, `skills/document-parsing`, `skills/documentation`.

## When the website/UI materializes

The `sde-extraction-app/` folder is already structured. To activate:

1. Populate each `.json` config (currently PLACEHOLDER stubs) with real values once the product shape is known
2. Register `sde-extraction-app` with the-loom Project Registry
3. Set `LOOM_PROJECT_ID=sde-extraction-app` on the deployment platform's env vars (NOT in the repo's local `.env`)
4. The hard boundary applies: `-app` and `-dev` instances MUST NOT share memory, context, permissions, or logs

## Status (2026-05-31)

- Seeded; both instance folders structured (one active, one placeholder)
- `sde-extraction-dev` NOT YET registered with `https://loom-project-registry.onrender.com/projects` — pending
- `sde-extraction-app` registration deferred (no deployed app yet)
- `research-project` adapter NOT YET implemented in Make_Skills — pending
- `development` adapter NOT YET implemented in Make_Skills — pending
