# `.project-intelligence/` — SDE_Extraction's instance state

Per the three-layer model (see `the-loom/docs/architecture/2026-05-31-five-module-platform.md` § Module 4), the recursive skill-making engine is structured as:

- **Reusable core engine** → lives in `Lizo-RoadTown/Make_Skills`
- **Project-type adapters** → live in `Make_Skills/adapters/<type>/`
- **Project-local instance state** → lives HERE

SDE_Extraction currently has **one** instance attached (`sde-extraction-dev`). A second instance (`sde-extraction-app`) may be added later when the website/UI surface materializes.

```text
.project-intelligence/
├── instances.json                   Canonical manifest
├── README.md                        This file
└── sde-extraction-dev/              Current single instance (researcher + developer-facing)
    ├── project-type.json
    ├── attached-adapters.json
    ├── agent-profile.json
    ├── project-context.json
    ├── observatory-config.json
    ├── local-skill-candidates/
    ├── workflow-candidates/
    ├── promotion-candidates/
    └── lessons-learned/
```

## How an agent picking up this repo should orient

1. **You ARE `sde-extraction-dev`** — the researcher/developer-facing instance.
2. Your LOOM_PROJECT_ID is `sde-extraction-dev`.
3. Tag all `memory_recall` / `memory_write` with `project_tags=["sde-extraction-dev"]`.
4. Read your config from `.project-intelligence/sde-extraction-dev/`.
5. The methodology skills you'll lean on most for research-heavy work: `skills/deep-research-pattern`, `skills/eval-deep-research`, `skills/document-parsing`, `skills/documentation`.

## When the website/UI materializes

A new instance `sde-extraction-app` will be added here as a sibling folder. It will have its own LOOM_PROJECT_ID, its own adapter, its own memory tag scope, and the same hard boundary as the Hub's two instances: the app instance and the dev/research instance MUST NOT share memory or context.

## Status (2026-05-31)

- Seeded; one instance configured (`sde-extraction-dev`)
- NOT YET registered with `https://loom-project-registry.onrender.com/projects` — pending
- `research-project` adapter NOT YET implemented in Make_Skills — pending
- `development` adapter NOT YET implemented in Make_Skills — pending
