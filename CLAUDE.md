# Working in the SDE_Extraction repo

Project context for Claude Code. Loaded into every session opened in this repo.

## What this repo is

A research-heavy project today. Possibly a full application (website + backend + frontend) later. The work right now is deep literature review, data analysis, synthesis of findings. The eventual product is undefined — that's part of what the research will surface.

Per the three-layer model (see [the-loom architecture doc](https://github.com/Lizo-RoadTown/the-loom/blob/main/docs/architecture/2026-05-31-five-module-platform.md)), this is a **consuming project** with one project-local instance attached: `sde-extraction-dev`.

When the website/UI surface materializes later, expect a second instance (`sde-extraction-app`) to be added — mirroring the Summer 2026 Hub's two-instance pattern.

## You are the developer/research instance

| You are | Future instances |
|---|---|
| `sde-extraction-dev` | `sde-extraction-app` (when web/UI is built; not yet) |
| Researcher + developer-facing | Will be product/user-facing later |
| Memory tag: `["sde-extraction-dev"]` | Will be `["sde-extraction-app"]` |
| Adapter: `research-project` (in Make_Skills, pending impl) + `development` for code work | Will be a product-shaped adapter |

## Where to read

| File | Purpose |
|---|---|
| `README.md` | Repo overview + layout |
| `skills/` and `skills_private/` | 16 methodology skill files bundled locally |
| `.project-intelligence/instances.json` | Canonical manifest |
| `.project-intelligence/sde-extraction-dev/agent-profile.json` | YOUR profile + memory discipline |
| `.project-intelligence/sde-extraction-dev/project-context.json` | What this project is about (will evolve as research clarifies) |
| `.project-intelligence/sde-extraction-dev/observatory-config.json` | Events you log + pattern triggers |
| `docs/architecture/loom-wiring.md` | How this repo plugs into the-loom + Make_Skills |
| `research/` | The primary work surface — literature, data, notebooks, findings |
| `AT3_review/` | **REFERENCE ONLY** — vendored copy of the prior HITL review system (see below) |
| `Agent Drafts/` | AI-generated/assisted output, **not yet human-validated**. Agents write here. |
| `Human validated/` | Reviewed + approved by Liz. **Agents must NOT write here** — only Liz promotes. |

## Provenance convention — `Agent Drafts/` vs `Human validated/`

These two folders document the human-in-the-loop division of labor for Liz's own work (the same
pattern as AT3_review's `original/` → `review-copy/` → `completed/`). The point: a chat transcript
shows Liz's questioning but not her judgment applied to outputs. This split makes that judgment
legible and auditable.

- **`Agent Drafts/`** — everything an LLM/agent/workflow produced that a human has not yet checked.
  Agents and workflows write here. Each artifact gets a provenance header (what generated it, when,
  from what human input, validation pending).
- **`Human validated/`** — artifacts Liz has read, verified, corrected, and stands behind.
  **This is an integrity boundary: agents never write into `Human validated/`.** Only Liz promotes
  a draft here (with a short note on what she validated/changed). An item here means a human
  endorsed it; an item in `Agent Drafts/` means not yet. The diff between the two is the evidence
  of Liz's contribution.

## Reference material — `AT3_review/`

`AT3_review/` is a **read-only reference folder**, not an active work surface. It is a local
copy of the existing GitHub-based human-in-the-loop (HITL) review queue for SDE
epidemiological models — the manual curation → first-review → second-review pipeline that
predates this project. It includes its own `curation-dev/` folder (the curator's working
notebooks + the curation template).

Rules for this folder:

- **Do not edit it, refactor it, or treat it as part of SDE_Extraction's runtime or dev surface.** It is its own git repository (nested `.git/`) with its own history.
- **It is git-ignored** in this repo (see `.gitignore`) so it never gets committed as an embedded-repo pointer.
- **Read it for context**, not as a target. It shows what was being done manually; the new
  direction is to automate the *curation/extraction* step (paper → structured SDE model)
  using OpenAI + Pydantic, then feed results into a HITL queue like this one for verification.
- Highest-value files: `AT3_review/curation-dev/template/curation-template.ipynb` (the de
  facto extraction schema), `AT3_review/docs/AI_AND_AUTOMATION.md`, `AT3_review/docs/ROADMAP.md`,
  and `AT3_review/ignore guidance docs/` (the SDE-pipeline architecture sketches).

## Methodology skills (in this repo)

Bundled locally — don't fetch from remote. Read the relevant SKILL.md before working in its domain.

**Research-focused (the primary set for this phase):**

- `skills/deep-research-pattern` — research methodology (THE playbook for heavy lit/data work)
- `skills/eval-deep-research` — evaluating research outputs
- `skills/document-parsing` — extracting structure from source documents
- `skills/documentation` — Diátaxis docs methodology (for writing findings)
- `skills/layered-explanation` — ELI5 → quick reference → depth → mental model

**Build-focused (for when web/UI work begins):**

- `skills_private/web-app-scaffold` — scaffolding methodology
- `skills/design-evaluation` — evaluating design choices
- `skills/infrastructure-mapping` — recognizing system architecture

**Always-on:**

- `skills_private/agentic-upskilling` — observe → promote → codify loop
- `skills_private/lessons-learned` — friction-as-memory operational pattern
- `skills_private/proposal-authoring` — architectural proposals + ADRs
- `skills_private/orchestration-cataloging` — multi-agent orchestration patterns
- `skills_private/roadmap-maintenance` — roadmap update methodology
- `skills_private/open-source-documentation` — public docs methodology
- `skills/agentic-skill-design` — designing agentic skills (meta)
- `skills/next-actions-planning` — planning next steps

**Cite the skill by name when you invoke one** (per the discipline plugin).

## Memory hierarchy

1. **the-loom MCP** at `https://loom-agent-context.onrender.com/mcp/memory/` — durable cross-session memory. Tag: `project_tags=["sde-extraction-dev"]`. Use `memory_recall` at the start of substantive tasks; use `memory_write` when you learn something durable.
2. **`~/.claude/projects/<this-repo-key>/memory/MEMORY.md` + sibling files** — auto-loaded session memory.
3. **`docs/proposals/*.md`** — architectural decisions.
4. **`docs/plans/*.md`** — dated execution plans.
5. **`docs/test-runs/*.md`** — friction-surface logs.
6. **`docs/decisions/*.md`** — ADRs (decision records).
7. **`research/findings/*.md`** — synthesized research outputs.
8. **Git history** — explain *why* in commit messages.

## Discipline rules (auto-injected by the plugin, restated for clarity)

- **PROBE before asserting** — Grep/Read files before claiming facts; cite file:line
- **Distinguish dev-tooling from runtime** — for this repo: `research/` + `scripts/` + `docs/` = dev-tooling; `apps/` + `services/` (when populated) = runtime; `AT3_review/` = read-only **reference** (neither — don't edit, don't commit)
- **Save friction as memory immediately** — write a feedback memory tagged `["sde-extraction-dev"]` when Liz corrects you
- **Cite skills by name** when invoking
- **Layered explanation pattern** — ELI5 → quick reference → depth (cite file:line) → mental model
- **No marketing voice** — describe what *is*

## Token discipline

- Read smallest viable scope; never re-read what's already loaded
- `Grep` first, `Read` with offset/limit second
- `Edit` not `Write` for modifications
- Heavy research means LOTS of source documents — use `document-parsing` skill to extract structure efficiently

## Tone

Plain, direct, descriptive. No marketing voice. Same rule as all of Liz's repos.

## Commit + PR discipline

- Small PRs, one concern per branch
- `gh pr create` with Test Plan checklist
- Never `--no-verify`, never `--amend` after pushing
- Co-author tag: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

## What to do when in doubt

1. `memory_recall(context="<your current task>", project_tags=["sde-extraction-dev"])` — see if past sessions covered this
2. Read the relevant `SKILL.md` from `skills/<name>/` or `skills_private/<name>/`
3. Read `docs/architecture/loom-wiring.md` for integration
4. Check `.project-intelligence/sde-extraction-dev/` configs
5. If about to make a destructive change, ask Liz first
