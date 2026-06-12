# Validation points — the gated-checkpoint map

*Approved principle, Liz 2026-06-12. The pipeline is a chain of VALIDATION POINTS:
at every transfer where information crosses a boundary, an explicit gate (machine or
human) must PASS before the data is allowed to proceed. The licence gate is the
pattern; this map applies it everywhere. This is the observability spine made into
checkpoints — not just observable, but gated.*

## The principle

> Information does not flow freely from stage to stage. At each boundary it reaches a
> **validation point**: a check that must pass for the data to advance. Some checks are
> automatic (a hash matches, a licence is open, a schema validates); some require a human
> (the present/absent verdict). A failed gate stops the data and routes it (reject, retry,
> or escalate) — it never silently proceeds.

Three things every validation point declares:
1. **What is checked** — the specific claim being validated.
2. **Who checks** — machine or human.
3. **What pass / fail means** — where the data goes on each outcome.

## Two human roles — passive observation vs. active decision (Liz, 2026-06-12)

The human is **passive through the entire machine chain** and **active at exactly two points**.
This is the load-bearing distinction:

| | **Observe + instrument** (the machine gates) | **Decide** (the human gates) |
|---|---|---|
| Human role | **passive** — watching, not gating | **active** — the decision IS the gate |
| Where | every machine validation point (V1–V7) | **intake** (choose ingestion type) and **V8** (present/absent verdict) |
| What the human may do | see each data interface; apply/adjust telemetry; change *how* the point is observed (backend reach into the observation, not the flow) | choose hands-on / handoff / connection; render the verdict that moves the data |
| Does the human stop the data here? | **No** — the machine gate decides pass/fail autonomously | **Yes** |

So V1–V7 are **machine gates with a human observe-and-instrument layer**: the machine validates and
advances the data on its own, while the human can watch every crossing live and tune what telemetry is
captured about it — without being required to act for the data to proceed. The human's *active*
involvement is reserved for the two irreducibly-human decisions: **what ingestion type at intake**, and
**the present/absent verdict at V8**. Everywhere else, the human is an observer with a tuning knob, not
a gatekeeper.

## The full chain (intake → extract → verify → library)

Grounded in the real stages (`extraction_jobs.stage`, `extractions.status`) plus the
validated DOI-snapshot intake. Each `▣` is a validation point.

```mermaid
flowchart TD
    A[DOI submitted] --> V1{▣ V1 · DOI resolves?\nmachine · Crossref}
    V1 -- fail --> X1[reject: unresolvable DOI]
    V1 -- pass --> V2{▣ V2 · Open licence?\nmachine · Crossref license[]}
    V2 -- fail --> X2[reject_licence: not open · terminal]
    V2 -- pass --> F[fetch via TDM]
    F --> V3{▣ V3 · Snapshot intact?\nmachine · served_sha256 recorded}
    V3 -- fail --> R3[retry: fetch]
    V3 -- pass --> V4{▣ V4 · Text derived cleanly?\nmachine · normalization ok}
    V4 -- fail --> R4[flag: normalization failed]
    V4 -- pass --> E[extract · OpenAI present/absent]
    E --> V5{▣ V5 · Schema valid?\nmachine · Pydantic structured output}
    V5 -- fail --> R5[retry: re-extract]
    V5 -- pass --> V6{▣ V6 · Lineage re-hashes?\nmachine · checksums_for re-verify}
    V6 -- fail --> R6[flag: lineage mismatch]
    V6 -- pass --> V7{▣ V7 · Figure reproduced?\nmachine · the oracle, when available}
    V7 -- pass/na --> H[escalate to human · needs_human]
    H --> V8{▣ V8 · Human confirms present/absent\nHUMAN · the HITL verdict}
    V8 -- send back --> R8[return for correction]
    V8 -- approve --> L[▣ moved to verified table → Library]
```

## The validation points, in detail

| # | Validation point | Who | What is checked | Pass → | Fail → |
|---|---|---|---|---|---|
| **V1** | DOI resolves | machine | Crossref returns a real record for the DOI | proceed to V2 | reject (unresolvable) |
| **V2** | Open licence | machine | Crossref `license[]` is on the open allow-list | fetch | `rejected_licence` (terminal — never fetched) |
| **V3** | Snapshot intact | machine | fetched bytes hashed; `served_sha256` recorded; HTTP ok | normalize | retry fetch (backoff) |
| **V4** | Text derived | machine | normalization produced non-empty text from the raw layer | extract | flag: normalization failed (needs attention) |
| **V5** | Schema valid | machine | OpenAI output conforms to the Pydantic schema (structured outputs) | proceed to V6 | retry / re-extract |
| **V6** | Lineage re-hashes | machine | each present slot's quote re-hashes to its recorded `quote_sha256`; offsets resolve in the text | proceed to V7 | flag: lineage mismatch (cannot trace to source) |
| **V7** | Figure reproduced | machine | captured values regenerate the paper's figure (the oracle) — *when the engine can run it* | escalate to human | flag: figure mismatch |
| **V8** | Human verdict | **human** | the reviewer confirms present/absent per slot against the source (the HITL act) | **approve → moved to the verified table → searchable in the Library** | send back for correction |

## What each gate's failure does (no silent proceed)

- **Terminal reject** (V2): not open-licence → it never enters. Recorded, not retried.
- **Retry with backoff** (V3, V5): transient/automatable → re-attempt, dead-letter after max attempts.
- **Flag for attention** (V4, V6, V7): a real anomaly a human should see (normalization broke,
  lineage doesn't trace, figure won't reproduce) → surfaced, not auto-dropped.
- **Human gate** (V8): the only point requiring human judgment. Approve performs the **DB table
  move** into the verified/approved set that feeds the Library (per Liz: "approve" = the database
  moves the model into the approved table, which becomes searchable).

## Machine gates vs the human gate

Most validation points are **machine** — they make the human's one gate (V8) trustworthy by clearing
everything provable first. The human never validates what a machine can: they validate the one thing
only a human can — *is this present/absent judgment correct against the source?* This is why V1–V7
exist: to ensure that by the time data reaches V8, every mechanical question is already answered, and
the human's attention is spent only where it's irreplaceable.

## Relationship to the observability spine

The observability spine says every transfer is an **observable window**. This map says every transfer
is also a **gate**. They are the same boundaries seen two ways: you can *watch* what crosses (spine),
and nothing crosses *unvalidated* (this map). Together: every hand-off is visible AND gated.

## Recording (the audit trail)

Every validation point, on firing, records: which point, machine-or-human, the outcome (pass/fail),
when, and (for human) who. This is the validation audit trail — provenance shows not just *what* the
data is, but *every check it passed* to get there. (Tables: machine checks alongside the stage rows;
human verdicts in `review_decisions`; lineage re-hash in `extraction_lineage.lineage_verified`.)

## Telemetry — the health of each point, and of agents at each point (Liz, 2026-06-12)

The map shows *where* the gates are. Telemetry tells us *how healthy each gate is* — and, where an
**agent** operates a gate, *how healthy that agent is*. Two distinct health subjects per point:

### 1. Point health — is this validation point working well?
Per validation point, over a window, capture:
- **Throughput** — items that reached this point.
- **Outcome distribution** — pass / fail / retry / flag rates. A rising fail or flag rate is the
  primary unhealthy signal (e.g. V6 lineage mismatches climbing → something upstream is corrupting
  quotes or offsets).
- **Latency** — time the check takes (a slow point is a bottleneck or a degrading dependency).
- **Backlog** — items waiting before this point (esp. before the human gate V8).

### 1b. Most gates are validation SCRIPTS — and that's good (Liz, 2026-06-12)

A machine gate is usually a **deterministic validation script**, not an agent: does the hash match?
is the licence on the allow-list? does the output conform to the schema? does the quote re-hash? These
have a fixed pass/fail and **no judgment** — which makes them *more* trustworthy than agent calls, not
less. A point validated only by a script is a perfectly good validation point.

The one requirement (Liz): **we must be able to monitor it.** A silently-broken script that passes bad
data is the failure mode to prevent. So every validation script gets a **runtime monitor**:
- **Up / running** — did the check actually execute (vs. silently skipped / erroring)?
- **Pass-rate** — its outcome distribution over time (a deterministic check whose pass-rate suddenly
  shifts means its *input* changed — an early warning).
- **Error / exception rate** — the script itself failing (vs. returning a clean fail).
- **Latency** — slowdown signals a degrading dependency.

So the three health subjects at a point are: the **script** (runtime monitor, above), the **point**
overall (throughput / fail / backlog), and — only where one operates — an **agent**.

### 2. Agent health — when an agent acts at a point, is that agent healthy?
Some points are operated by an agent (the extractor at V5; any future auto-classifier at intake; the
machine-verifier across V3–V7). For each such agent, at each point it operates:
- **Identity** — which agent + version/prompt (the stable identity confidence is keyed to).
- **Success rate *at this point*** — e.g. the extractor's schema-conformance rate at V5, its
  lineage-pass rate at V6.
- **Drift** — is that success rate trending down over time / versions?
- **Latency + error/refusal rate** — operational vitals.
- **Downstream outcome** — of what this agent passed, how much later *failed a human verdict* (V8)?
  That back-propagated signal is the truest measure of the agent's health.

### How this connects to the three pillars
- **Agent health IS how confidence is earned.** The agent-health signals above (esp. the
  back-propagated V8 outcome, tagged by model type / figure type) are exactly the telemetry the
  **confidence pillar** consumes to raise or lower an extractor's earned confidence per dimension.
  This telemetry layer *feeds* confidence; it is not separate.
- **Point health is what Extraction Health surfaces.** The dashboard's Extraction Health surface
  becomes the live view of point health + agent health (replacing its current sample data), so the
  human's *passive observe-and-instrument* role (V1–V7) has something real to watch and tune.

### Where the telemetry goes
Each point, on firing, emits a telemetry event (point id · subject {point|agent+version} · outcome ·
latency · timestamp · tags {model_type, figure_type, …}). Destination: **OTel → the-loom** (already
the project's observability channel) and/or a `validation_events` table for in-DB querying. The same
event doubles as the audit-trail row (above) — one record serves both provenance and health.

### Honest status
The telemetry layer is **designed, not built**. Today the dashboard's Extraction Health shows sample
numbers; the real point-health / agent-health events are not yet emitted. This section is the plan for
what to instrument as each validation point is built — so health monitoring is designed *in*, not
bolted on. The confidence-compute that consumes agent-health is the confidence pillar's own build
(still under review).

## Honest status

- **Real today:** V2 (licence gate — designed), V5 (schema validity — the structured-output call),
  V6 (lineage — `checksums_for` exists). V8 (the HITL surface exists; the DB-move-on-approve is the
  intended mechanism, not yet wired).
- **Designed, not built:** V1, V3, V4 (the DOI-snapshot intake isn't built yet), the recording of
  each machine gate as an explicit audit row.
- **Conditional:** V7 (figure reproduction) only fires when the engine can regenerate a figure —
  marked n/a until then.

## Out of scope (now)

- The exact audit-table shape for machine-gate outcomes (settle with the intake migration).
- Confidence's role at the gates (confidence may *weight* how much scrutiny V8 gets — that's the
  confidence pillar, separate).
