---
name: infrastructure-mapping
description: Map any project's infrastructure as modules + interfaces + bond strength, grounded in Herbert Simon's nearly-decomposable systems framework (1962) and its modern descendants (Parnas, Baldwin & Clark, DDD, hexagonal architecture). Produces a module table, an interface table (with "signal felt by Claude vs by the user" columns), a Mermaid diagram, and identifies WHERE infrastructure investment closes silent leaks. Use when auditing a codebase for the first time, after acquiring a repo, before a refactor, or when the user is frustrated that the system feels unstructured. Different from next-actions-planning (picks what to do next) and design-evaluation (picks how to do one thing) — this skill produces the WHOLE-SYSTEM MAP so other skills can target it.
---

# Infrastructure mapping (Simon-grounded)

Treat the system as a **nearly-decomposable hierarchy**. Identify modules (stable sub-assemblies with high internal cohesion), interfaces (low-frequency cross-module summaries — the places where bond strength drops), and the **signal delta** at each interface — what the agent feels vs what the user feels when that interface leaks.

The output is `docs/plans/<YYYY-MM-DD>-infrastructure-map.md` plus a short report. Use it as input to other skills (`design-evaluation`, `next-actions-planning`, `lessons-learned`) — this skill produces the map; other skills act on it.

## When to use

**Apply when:**
- Auditing a codebase for the first time (acquisition, contractor handoff, new role)
- Before a non-trivial refactor — understand the seams before cutting
- When the user says "I don't know how this is wired" / "I keep losing track" / "agents don't see each other" / "I have to repeat myself"
- After a long building session, to take stock
- Once per quarter, as a hygiene pass on a system you own

**Don't apply when:**
- The system is too small to have meaningful modules (single-file scripts, prototypes)
- The user wants a specific question answered ("does X use Y?") — use `agentic-skill-design`'s PROBE step directly
- Documentation is the goal, not analysis — use `documentation` skill instead

## Vocabulary (use consistently)

Drawn from Simon (1962), Parnas (1972), Baldwin & Clark (2000), Evans/DDD (2003), Cockburn (hexagonal), Martin (cohesion/coupling).

| Term | Meaning | Use when |
|---|---|---|
| **Module** | A stable sub-assembly with high internal coupling | Describing a piece you can swap independently |
| **Interface** | The low-frequency, summarisable cross-module boundary | The contract between modules |
| **Hidden parameters** (Baldwin & Clark) | What's internal to the module — implementation, things likely to change (Parnas) | Listing what you'd hide behind the interface |
| **Design rule** (Baldwin & Clark) | A visible cross-module decision: a schema, a protocol, a shared secret | Listing what BOTH sides must agree on |
| **Cohesion** | Why a module's contents belong together. Ladder (worst→best): coincidental < logical < temporal < procedural < communicational < sequential < functional | Tagging each module |
| **Coupling** | How tightly modules depend on each other. Afferent (Ca, incoming), efferent (Ce, outgoing) | Quantifying interdependence |
| **Instability** (Martin) | `I = Ce/(Ca+Ce)` — 0 = stable (depended on, depends on nothing), 1 = unstable | Ranking modules |
| **Bounded context** (DDD) | A module with its own ubiquitous language | The semantic equivalent of a Simon subsystem |
| **Anti-corruption layer** (DDD) | A translator that prevents one module's concepts leaking into another | Naming protective wrappers |
| **Port + adapter** (Cockburn) | Port = intent-shaped interface; adapter = tech-specific translator | When describing platform-agnostic abstractions |
| **Published language** (DDD) | The shared vocabulary on the wire | Naming what passes through an interface |

Honest caveat: "bond strength" as a number is hand-wavy. Use **instability `I`** and the **cohesion ladder** as proxies. Don't invent metrics that aren't measurable.

## 1. PROBE — identify the modules

Read these in parallel before describing anything:

```
git log --oneline -30                              # recent activity, what's churning
ls -la                                              # repo root — major folders are usually modules
find . -maxdepth 3 -name "package.json"             # JS modules
find . -maxdepth 3 -name "requirements.txt"         # Python modules
find . -maxdepth 3 -name "*.toml" -o -name "*.yaml" # deploy configs
ls .github/workflows 2>/dev/null                    # CI is a module
ls ~/.claude/projects/.../memory/ 2>/dev/null       # session memory is a module
cat README.md ARCHITECTURE.md 2>/dev/null           # existing maps
```

For repos with infra files, also read:
- `render.yaml`, `vercel.json`, `fly.toml`, `Dockerfile`, `docker-compose.yml` — deployment modules
- `package.json` (root + per-workspace) — frontend modules
- `requirements.txt` / `pyproject.toml` / `Cargo.toml` — backend modules
- `.mcp.json` / `mcp.json` — MCP server modules (ports to external tools)
- `auth.ts` / `auth.py` / equivalent — auth wiring (usually a cross-cut)

For project-starter-scaffolded repos, the snapshot script at `scripts/architecture_snapshot.py` produces a structured JSON that's a faster starting point — read it first.

### 1a. PROBE existing wiring before recommending anything new

Before naming a single new tool, grep the repo for tooling that's already wired. The recommendation-without-PROBE failure surfaces most often around observability, auth providers, and storage — products that get half-installed and then forgotten.

Minimum sweep:

- `docker-compose.yml`, `compose.yaml` — services already running locally
- `render.yaml`, `fly.toml`, `vercel.json` — services already wired in deploys
- `.env.example`, `.env.local` — env vars referencing observability (`GRAFANA_*`, `SENTRY_*`, `LANGSMITH_*`, `LANGFUSE_*`, `OTEL_*`), auth (`NEXTAUTH_*`, `AUTH_*`, `CLERK_*`, `SUPABASE_*`), storage (`DATABASE_URL`, `REDIS_URL`, `LANCEDB_*`)
- `package.json`, `pyproject.toml`, `requirements.txt` — SDKs already imported (`@sentry/*`, `langsmith`, `posthog-*`, `@opentelemetry/*`)

If a tool is already wired, the recommendation is "finish wiring it" or "remove it" — never "add it fresh".

## 2. DECIDE — classify each module

Produce a table with one row per module. Required columns:

| # | Module | Layer | Cohesion | Instability | Hidden parameters | Notes |
|---|---|---|---|---|---|---|

- **Layer** = `runtime` (end-users hit it), `dev-tooling` (developer/agent hits it), or `cross-cut` (both).
- **Cohesion** = the cohesion-ladder type (functional is best; coincidental is worst). Most modules are functional or communicational.
- **Instability** = `I = Ce / (Ca + Ce)` — estimated from the dependency graph. Use rough buckets: low (≤0.3), medium (0.3-0.7), high (≥0.7). Don't invent precision you don't have.
- **Hidden parameters** = the implementation details the module hides. Things that could change without breaking the interface.

## 3. DECIDE — classify each interface

For each pair of modules that talk, produce a row with these columns:

| # | Interface | What passes (substrate + protocol) | Signal Claude feels when broken | Signal user feels when broken | Current wrapper | Wrapper gap | Hype vs mature | Both modes? |
|---|---|---|---|---|---|---|---|---|

This is **the load-bearing table**. The "signal felt by Claude vs user" distinction is what makes the map actionable:

- **Claude feels it, user doesn't** → in-process errors. Already handled by tooling. Lower priority.
- **User feels it, Claude doesn't** → SILENT LEAKS. User absorbs the cost; agent has no signal. **Highest priority for infrastructure investment.**
- **Both feel it differently** → same root cause, different symptoms. Wrapper here pays double.
- **Hype vs mature** = a one-word assessment of the wrapper or tool the row points to. `mature` = production-proven, stable API, used at scale; `hype` = recent, churning, vendor-pushed without independent track record; `mixed` = mature core, hype extensions. The column exists to slow down recommendations that lean on novelty.
- **Both modes?** = does the wrapper work in self-host and hosted-multitenant deployments? `yes` = both paths covered; `hosted-only` / `self-host-only` = needs a sibling path before shipping; `n/a` = the interface only exists in one mode. Forces the two-mode commitment through to every interface, not just the architectural overview.

Specific interface types to look for (use as a checklist — most systems have all of them):

1. **Browser → host** (HTTPS) — usually fine, deploys handle it
2. **Frontend → backend** (HTTP + auth) — JWT or session cookies; **brittle if secret rotation isn't coordinated**
3. **Backend → DB** (driver-mediated SQL) — usually solid in-process
4. **Backend → semantic store** (vectors, LanceDB, etc.) — often shared between runtime + dev-tooling
5. **Agent session → memory files** (auto-loaded) — per-machine, NO cross-machine
6. **Agent session → plugins/skills** (Claude Code: hooks + skill registry) — fragile to PATH + truncation
7. **Repo ↔ marketplace** (plugin install) — version drift if no CI sync
8. **Repo ↔ upstream template** (scaffolding source) — drift unless `copier update` or equivalent
9. **Agent ↔ agent** (handoff between sessions or platforms) — usually file-mediated, no event notification
10. **Code state ↔ docs** (ARCHITECTURE.md, diagrams) — drift unless enforced
11. **Code state ↔ CHANGELOG** — drift unless required-by-CI
12. **PR ↔ CI** — only as good as the workflows present
13. **User ↔ agent** (the prompt+response interface itself) — user frustration is a real signal
14. **Environment assumptions ↔ runtime** (Python on PATH, specific binaries) — silent failures
15. **Code state ↔ traces / metrics / logs** (OpenTelemetry boundary) — drift unless OTel SDK is wired in both runtime and dev-tooling paths
16. **LLM calls ↔ tracing** (LangSmith / Langfuse boundary) — usually a wrapper around the model client; brittle if only some call sites are instrumented
17. **Errors ↔ alerting** (Sentry / equivalent boundary) — silent unless the SDK is initialised before the first import that throws
18. **Service health ↔ dashboards** (Grafana / equivalent boundary) — present only if the scrape targets and dashboards are checked in alongside the services

## 3.5. ACT — per-interface wrapper research

Once the interface table is complete, group the rows by **wrapper type** (auth resilience, cross-machine state, plugin/skill hygiene, agent/human handoff, observability are the recurring groups — usually 4-6 per project) and dispatch parallel research agents, one per group. Each agent's brief:

- For each interface in the group, recommend a concrete wrapper.
- For each recommendation, label: phase (A/B/C per §4), one-word hype assessment, both-modes coverage, and the smallest viable first PR.
- Cite at least one mature reference implementation (open-source repo, vendor docs page, internal precedent) per recommendation.

Synthesise the agents' returns into a `reference_wrapper_research_per_interface.md` memory entry. This file is the input to §4's "What to do next" block — without it, the map describes the shape but not the move.

Skip this step only when the interface table has fewer than ~6 rows or the user explicitly wants the structural map alone.

### 3.5a. Observability is a cluster with its own internal layering

When the wrapper-type clustering produces an **observability** group, decompose it further into two SUB-layers before recommending a stack. Observability has two distinct audiences and they need different infrastructure even though one dashboard layer can serve both:

- **Runtime app observability** — watches the running application (HTTP requests, DB queries, LLM calls, exceptions). Audience: anyone monitoring production. Right stack: OpenTelemetry SDK → Tempo/Loki/Prometheus → Grafana; plus specialized SaaS for the deep-dive jobs (LangSmith for LLM conversations, Sentry for stack traces + replay).
- **Dev-experience observability** — watches the development process (hook fires, memory writes, skill invocations, architecture drift). Audience: the developer + collaborating agents. Right stack: file-tail (Promtail → Loki) for streaming logs + polling script → Postgres for periodic snapshots. **OpenTelemetry is overkill here** — the data sources are file-based or polling-derived, not request-lifecycle-shaped.

Decision rules that go with the layering:

1. OpenTelemetry is the protocol for runtime-app telemetry only; skip it for dev-experience
2. Grafana is the dashboard layer (queries other stores); it doesn't store anything itself
3. Specialized UIs (LangSmith, Sentry) stay for forensic deep-dive — don't try to consolidate them into Grafana
4. Same Grafana instance can serve both layers; build different dashboards per audience
5. Self-host vs hosted: gate by deployment topology AND a code-level `PLATFORM_MODE` check (defense in depth)
6. Dev-experience telemetry stays local-machine by default; don't ship hook logs to SaaS backends

Reference memory: `reference_observability_layering.md` captures the full pattern with citations. PROBE it whenever the conversation is about telemetry, OpenTelemetry, Grafana, LangSmith, Sentry, Langfuse, Helicone, PostHog, log aggregation, error tracking, or distributed tracing.

## 4. ACT — build the map artifact

Write `docs/plans/<YYYY-MM-DD>-infrastructure-map.md`:

```markdown
# Infrastructure map — <date>

## Summary (3 bullets, ≤ 30 words each)
- ...
- ...
- ...

## Modules
[Table from §2]

## Interfaces
[Table from §3 — THE meat]

## Signal-delta analysis
- Claude-only signals: [list interface IDs]
- User-only signals (the silent leaks): [list interface IDs]
- Shared signals: [list interface IDs]

## Diagram
```mermaid
graph TB
    [modules as nodes; interfaces as labeled edges; bond strength annotated; subgraphs for layers]
```

## Findings
- The N interfaces with no wrapper at all: [list]
- The N highest-frequency interfaces (fires every session): [list]
- The user-only signals (highest leverage to fix): [list]
- The recently-added modules (most likely to have weak interfaces): [list]

## Phasing

Group "What to do next" actions into three phases:

- **Phase A — small + high leverage.** Single-PR changes that close a user-only signal or remove a chronic friction. Usually plugin/skill hygiene, doc-state, handoff wrappers. Ship within days.
- **Phase B — medium structural.** Multi-file or cross-module wrappers that need a design pass first. Cross-machine state, agent↔agent handoff, anti-corruption layers. Ship within weeks.
- **Phase C — mature safety nets.** Production-grade resilience for interfaces that are already working: retry budgets, circuit breakers, secret rotation, backup/restore drills. Ship when the system has users to protect.

Each "What to do next" entry MUST carry its phase letter. Mixing phases in a single PR is the failure mode.

## What to do next
[Concrete actions, grouped by phase (A/B/C — see Phasing above), ranked within each phase by leverage. Each one: which interface, what wrapper, what file to touch, hype assessment, both-modes coverage.]
```

Plus a 3-bullet report to the user:

```
Map: docs/plans/<date>-infrastructure-map.md

Top three slip-throughs: <I-id> (<one line each>).
Top three already-solid interfaces: <I-id> (<one line each>).
```

## 5. ACT (optional) — deep-search for instances

If the user wants to find every slip-through (not just the structural map), dispatch parallel agents to mine three sources:

- **Session memory** (`~/.claude/projects/.../memory/`) — every `feedback_*.md` is a slip-through that hit hard. Tag by interface ID.
- **`docs/test-runs/`** — friction surfaced in real runs. Same tagging.
- **`git log` for `fix`, `revert`, `sorry`, `forgot`** — commits often record slip-throughs in their messages.

Each agent returns a count + concrete examples per interface ID. Aggregate into a **frequency report** appended to the map.

## Anti-patterns to refuse

- **Listing every dependency as a module.** A module is a stable sub-assembly with internal cohesion, not every Python package. Most deps live inside one module.
- **Inventing bond-strength numbers.** Use instability `I` and cohesion ladder. Don't claim precision you don't have.
- **Putting numbers on interfaces.** "I7 is 0.73 fragile" is fake. Use categorical buckets (no wrapper / brittle / solid).
- **Treating runtime and dev-tooling as one layer.** They have different consumers, different failure modes, different appropriate wrappers.
- **Skipping the user-signal column.** That's the whole point. The map without it is a tech inventory; the map WITH it is a prioritization tool.
- **Producing the map and stopping.** Hand off explicitly to `next-actions-planning` or `design-evaluation` for what to do with it.
- **Recommending a tool the repo already has.** If `docker-compose.yml` already runs Grafana or `render.yaml` already references LangSmith, "add observability" is wrong. The recommendation is "finish wiring what's there" or "remove the half-install". §1a is the guard against this.
- **Marking everything `mature`.** If every row's hype column is `mature`, the column is dead and the map is laundering vendor claims. Mark at least the recent / churning / vendor-pushed wrappers honestly — the column exists to surface novelty risk, not to certify safety.
- **Skipping the both-modes column for "obvious" interfaces.** Auth, storage, observability all have different shapes in self-host vs hosted-multitenant. The column being blank usually means the recommendation only works in one mode and the sibling path was never designed.

## Memory loop (the skill gets sharper over time)

After each map:

- Save the interface inventory as a `reference_*.md` memory entry. Future maps start from the prior list and update.
- If a wrapper was added and an interface moved from "silent leak" to "monitored", note that in the same memory entry.
- If the user identified a category of interface the skill didn't list (e.g., "we also have a billing webhook"), add it to the §3 checklist for next time.

### Evolve the skill via drafter + reviewer

When a mapping session surfaces lessons that belong back in this skill, evolve it in two passes, not one:

1. **Drafter pass.** Produce a markdown report with one entry per concrete edit: target section + line numbers, operation (insert / replace / append / new-section), verbatim new content, one-line rationale citing which session-memory item the edit addresses. No file writes.
2. **Reviewer/synthesizer pass.** A separate agent (or the same agent in a separate turn) reads the report, checks cross-references between sections still resolve, and applies the edits.

The split exists because skill edits drift toward padding when the drafter and applier are the same turn. The drafter's constraint ("every word serves a memory-file item") only holds when the writing and the applying are separated.

## Output expectations summary

When invoked, produce:

1. A **module table** with cohesion + instability + hidden parameters per module
2. An **interface table** with what-passes / Claude-signal / user-signal / wrapper / gap per interface
3. A **Mermaid diagram** with subgraphs per layer + bond-strength annotations on edges
4. A **signal-delta analysis** explicitly calling out the user-only signals (silent leaks)
5. A **findings** section listing top slip-throughs
6. A **3-bullet report** for the user

Skip anything that's truly empty. If the system has no MCP servers, don't write an MCP-server section.

## Pair with the public stack

This skill produces the map; other skills act on it:

- **`agentic-skill-design`** — the PROBE→DECIDE→ACT→REPORT discipline this skill follows; required upstream pattern
- **`design-evaluation`** — apply to a specific interface ("should I/O7 use MCP or REST?")
- **`next-actions-planning`** — pick which slip-through to close first
- **`lessons-learned`** — feeds the memory loop §6 with friction patterns mined from past sessions
- **`superpowers:brainstorming`** — when the interface list still feels incomplete
- **`superpowers:verification-before-completion`** — before claiming "the map is done", verify it against the actual file system one more time
- **`antigravity-bundle-architecture-design:architecture-patterns`** — for choosing the right pattern when building the wrapper a slip-through needs
- **`make-skills-discipline`** plugin (if installed) — the PROBE-first hook is the live enforcer of §1's PROBE step

## References

- Simon, H. A. (1962). *The Architecture of Complexity*. **Proc. American Philosophical Society 106(6).** Reprinted in *The Sciences of the Artificial*, ch. 8.
- Parnas, D. L. (1972). *On the Criteria To Be Used in Decomposing Systems into Modules*. **CACM 15(12).**
- Baldwin, C. Y. & Clark, K. B. (2000). *Design Rules: The Power of Modularity*. MIT Press.
- Evans, E. (2003). *Domain-Driven Design: Tackling Complexity in the Heart of Software*. Addison-Wesley. (Bounded contexts, context-map patterns, anti-corruption layer.)
- Cockburn, A. (2005). *Hexagonal Architecture*. alistair.cockburn.us.
- Conway, M. (1968). *How Do Committees Invent?* **Datamation.**
- Martin, R. C. (2002). *Agile Software Development*, ch. 20. (Afferent/efferent coupling, instability, Stable Abstractions Principle.)
- Stevens, W. P., Myers, G. J., Constantine, L. L. (1974). *Structured Design*. **IBM Systems Journal 13(2).** (Cohesion ladder.)
- Henry, S. & Kafura, D. (1981). *Software Structure Metrics Based on Information Flow*. **IEEE TSE.** (Fan-in / fan-out.)
