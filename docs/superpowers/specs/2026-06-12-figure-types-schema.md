# Figure types — the extraction constraint (self-growing list) + schema

*Design, Liz 2026-06-12. The figure type is **the constraint that drives extraction**, AND a
self-growing reference list in Supabase that is a stable **join key for agent-health and
confidence metrics**. Each figure type carries a profile of **what had to be present to
produce that figure** — the present/absent map. The list bootstraps from the data via
match-or-add; each figure is tied to its DOI and a captured image so groupings stay
auditable.*

## Why the figure is THE constraint (the load-bearing idea)

The figure is the only consistent, pinnable thing in a paper. Variables, parameters, what
they *mean*, the model structure — all free-for-all, unpinnable in advance. But there is
**always a figure, and the figure is an outcome that was produced** — so the paper *had to
contain everything needed to produce it.*

Therefore extraction is a **bounded BACKWARD search from the figure**, never forward
simulation:

> figure type → *what outcome was produced* → *what had to be present to produce it* → the
> finite list of things to search the paper for, present/absent each.

You never go forward (take variables, simulate, see what figure pops out, reverse-engineer
which one you got — unbounded and absurd). The figure is the **known endpoint**; the figure
type is the only anchor that **bounds and directs** the search. This **completes the
[document-architecture canon](../../../Agent%20Drafts/sde-extraction-approach/2026-06-05-document-architecture-canon.md)**:
the canon said "constrain the document"; the figure is *what* constrains it.

So a figure type is not merely a label or a health key — it **carries the present/absent map**
(the "required-to-produce" profile) that the agent searches against.

## Slots are fixed; their meaning is the variable

The slot *structure* is always the same — parameters, variables, initial conditions, drift,
diffusion. What *varies*, and is the interesting part, is what each slot **represents** in a
given paper (`β` is "a parameter" always, but transmission rate here, noise intensity there).
The figure type bounds *which* slots had to exist to produce the outcome and drives finding
*what they mean* in this paper.

## Also: the telemetry key (unchanged)

The figure type remains a stable join key for **agent-health / confidence** metrics: "the
extractor is healthy on stationary-distribution figures but degrading on sensitivity sweeps"
requires stable, identified figure-type ids — the dimension the
[validation-points telemetry](2026-06-12-validation-points-map.md) buckets agent health by.
(Both *model type* and *figure type* are confidence dimensions in
`apps/dashboard/src/surfaces/ExtractionHealth.tsx`.) Same id serves both roles: it drives the
extraction map AND buckets the health metrics.

## The backward search the figure drives (the extraction sequence)

Once a figure is classified, its type's `required_to_produce` profile drives a bounded,
ordered search of the paper — working back from the produced outcome to the machinery that
produced it. Each step is present/absent:

```text
THE FIGURE (a produced outcome)
  → 1. the stochastic MODEL   (the structure: drift + diffusion/noise that produced it)
  → 2. the PARAMETERS         (the constants the model uses)
  → 3. the VARIABLES          (the compartments / state the model evolves)
  → 4. the INITIAL CONDITIONS (the starting state the run began from)
```

Each item is searched-for against the source, present/absent each — never invented. This is
finite and directed *because* the figure bounds it: the outcome could only have come from a
model with these parts, so these are exactly the things to look for.

## The model (like a search index that grows itself)

No one enumerates every type up front. The corpus reveals them:

```mermaid
flowchart TD
    F[A figure identified during extraction] --> C[Extractor classifies its type\n+ a captured figure image]
    C --> M{Match-or-add script:\ndoes this type match the list?}
    M -- matches existing --> U[reuse figure_type_id]
    M -- no match --> N[insert a new figure_type row]
    U --> I[write figure_instance:\nDOI + label + type_id + image]
    N --> I
    I --> H[agent-health / confidence\nbucketed by figure_type_id]
    I --> A[audit path: look up by DOI →\nsee real figure images grouped by type]
```

## Schema (Supabase, alongside the other metadata)

```sql
-- the growing list — each type a row with a STABLE id (drives extraction AND keys telemetry)
create table figure_types (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,        -- normalized type name (the match key v1)
  description   text,                         -- what this type shows (the outcome)
  recognized_by text,                         -- visual/caption cues (how to classify it)
  -- THE EXTRACTION MAP: what had to be present to PRODUCE this figure type.
  -- The agent searches the paper BACKWARD from the figure against this profile,
  -- present/absent each. This is what makes the figure type the extraction constraint.
  required_to_produce jsonb,                  -- e.g. {state_variables, parameters, drift,
                                              --        diffusion/noise, initial_conditions,
                                              --        time_span, ...} the outcome demands
  is_result     boolean not null default true,-- false = non-results figure (schematic, ML
                                              --   diagnostics) → the bulk picker excludes it
  status        text not null default 'active', -- active | merged | deprecated
  merged_into   uuid references figure_types(id), -- if this type was later merged
  created_at    timestamptz not null default now(),
  -- provenance of the type's creation
  first_seen_doi  text,                       -- the DOI whose figure first introduced it
  created_by      text                        -- 'match-or-add-script' | 'human'
);

-- each identified figure instance — tied to its DOI + a captured image, for audit
create table figure_instances (
  id              uuid primary key default gen_random_uuid(),
  doi             text not null,              -- the paper (links to doi_queue / snapshots)
  snapshot_id     uuid references snapshots(id), -- the source snapshot it came from
  figure_label    text not null,              -- 'Figure 2', etc.
  figure_type_id  uuid references figure_types(id), -- the assigned type (nullable until classified)
  -- the captured figure image — so groupings are auditable by looking
  image_storage_key text,                     -- the figure image (crop/snapshot) in object storage
  image_sha256      char(64),                 -- fixity of the figure image
  -- the classification record
  classified_by   text,                       -- the extractor agent + version that classified it
  classifier_caption text,                    -- caption text the classifier used (often decisive)
  proposed_type_name text,                    -- what the extractor called it (before match-or-add)
  match_outcome   text,                        -- 'matched' | 'added_new'
  classified_at   timestamptz not null default now(),
  unique (doi, figure_label)
);
create index on figure_instances (figure_type_id);
create index on figure_instances (doi);
```

## The match-or-add script (extractor proposes, the list decides)

1. The extractor, during extraction, **classifies** each figure: a `proposed_type_name`,
   the caption it read, and a captured figure image.
2. The script checks the proposed name against `figure_types`:
   - **match** → reuse that `figure_type_id`, `match_outcome = 'matched'`.
   - **no match** → insert a new `figure_types` row (`created_by = 'match-or-add-script'`,
     `first_seen_doi`), use its id, `match_outcome = 'added_new'`.
3. Write the `figure_instance` with DOI + label + type_id + image + the classification record.

**Match strategy — start simple, refine later (Liz):**
- **v1:** normalized exact-name match (lowercase, trim, basic synonym map). Ships the
  self-growing list immediately.
- **later:** fuzzy / semantic (embedding) match above a threshold, when real data shows the
  name-only match is over-splitting. The schema doesn't change — only the match function.

## The audit path (catch wrong groupings by looking)

Because every instance carries `doi + figure_label + figure_type_id + image`, you can:
- Look up a DOI → see its figures and assigned types.
- Pull **all instances of one figure_type_id** → view the real figure images grouped together
  → spot mis-groupings (a sensitivity sweep filed as a sample-path).
- **Re-sort:** correct an instance's `figure_type_id`, or merge two over-split types
  (`status='merged', merged_into=…`). Agent-health metrics re-bucket automatically because
  they key on `figure_type_id`.

## Findings from the 3-source research that shape the classifier (input, not the list)

The reasoned/empirical/literature comparison (workflow `wwiehssea`) was *seed input*. Three
findings affect the **classifier**, not the list shape:
- **Caption-dependence:** single-path vs ensemble-mean vs multi-path are visually
  near-identical — separable only by caption text. So the classifier should get the
  **caption** (`classifier_caption`), not just the image.
- **Co-occurrence / multi-label:** one panel can be two types at once (a sweep that is also a
  det-vs-stochastic overlay). *Open:* allow an instance to carry more than one type, or
  classify per-panel? (v1: one type per figure; revisit.)
- **Exclusion classes:** schematics/flow-diagrams and ML-training plots are *non-results* —
  the list should hold them (as types with an `exclude`-style status or a flag) so the
  bulk auto-picker never targets them.

## Honest status

- **Designed, not built.** Extends the validated DOI-snapshot intake; the tables reference
  `snapshots`/`doi_queue` from that model.
- The captured **figure image** depends on extracting a figure crop from the source snapshot
  — feasible from JATS XML (figure assets) or a rendered page; settle the mechanism at build.
- The list **starts empty** and grows from real extractions — it does not get pre-seeded with
  the research's types (those are a sanity-check for what match-or-add will encounter).

## Open items

1. Match function v1 normalization + synonym map (what counts as the same name).
2. Multi-label per figure/panel: yes or no.
3. Exclusion-class representation (status flag vs separate concept).
4. Figure-image capture mechanism (XML asset vs page crop).
