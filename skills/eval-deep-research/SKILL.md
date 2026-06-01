---
name: eval-deep-research
description: Run the deep_research_bench (DRB) harness against a deepagents-produced report set. Use when you want to score the research subagents on the 100-task benchmark with the RACE (report quality) and FACT (citation grounding) judges.
---

# Eval — deep_research_bench

Score the research workflow against [deep_research_bench (DRB)](https://github.com/Ayanami0730/deep_research_bench) — 100 PhD-level tasks across 22 domains, scored by two LLM-as-judge rubrics:

- **RACE** — report quality (structure, depth, coverage, accuracy)
- **FACT** — citation grounding (does each claim trace to a cited source?)

DRB is **eval-only**, not part of the runtime. Clone on demand under `platform/eval/` (gitignored), run, throw away.

## Submission format

Each row in `data/test_data/<your_model_name>.jsonl`:

```json
{
  "id": "task-id-from-DRB-prompts",
  "prompt": "the original task prompt (echoed back)",
  "response": "the full markdown report your agent produced",
  "citations": [
    {"url": "...", "title": "...", "snippet": "..."}
  ]
}
```

The `id` MUST match an id in `prompt/` (DRB will skip rows with unknown ids). One row per benchmark task; no batching, no wrapping.

## Run

```bash
# 1. Clone the harness on demand (gitignored under platform/eval/)
git clone https://github.com/Ayanami0730/deep_research_bench platform/eval/deep_research_bench

# 2. Drop your generated reports
cp my_runs/2026-04-make-skills.jsonl platform/eval/deep_research_bench/data/test_data/

# 3. Set the judge model key
export GEMINI_API_KEY=...        # DRB currently uses Gemini-2.5-Pro as judge
                                  # (deprecating June 2026 — check the upstream README)

# 4. Run both scorers
cd platform/eval/deep_research_bench
bash run_benchmark.sh             # produces RACE + FACT scores
```

## What the writer subagent should optimize for

DRB rewards reports that:

- Open with a structured TL;DR / executive summary
- Use explicit headings that mirror the planner's questions
- Cite **every** factual claim — RACE penalizes uncited assertions, FACT penalizes claims that don't trace to the cited source
- End with a "Sources" or "References" section listing every URL, not just inline links
- Include limitations / open questions — RACE rewards epistemic humility

Encode these expectations in `subagents/writer/AGENTS.md` so the writer optimizes for the bench by default.

## When to run

- Any time the research pattern (`skills/deep-research-pattern/SKILL.md`) changes meaningfully — new role, new context boundary
- Any time you swap the researcher's tool belt (e.g. add/remove ToolUniverse, change web search backend)
- Before promoting a new model to be the orchestrator default

## Caveats

- DRB tasks are research-paper-flavored. They reward depth on academic-style questions; less informative for code-heavy or narrowly operational tasks.
- The Gemini judge requirement adds a per-eval cost (~$X / 100 tasks) and an external dependency. There's no offline scorer.
- DRB-II is in development; check if you want to migrate.

## Pair with the public stack

The DRB harness is the eval surface. Discipline around running and reporting evals:

- **`superpowers:verification-before-completion`** — required before reporting eval scores; evidence-before-claims
- **`antigravity-bundle-qa-testing:test-driven-development`** — for the harness wiring itself
- **`huggingface-skills:huggingface-community-evals`** — for cross-validating with HF eval leaderboards
- **`antigravity-bundle-llm-application-developer:langfuse`** — long-running eval observability (traces, costs, per-task latency)
