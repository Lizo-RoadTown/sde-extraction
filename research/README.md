# research/

The primary work surface during the research-heavy phase. Four subdirectories:

| Dir | Purpose |
|---|---|
| [`literature/`](literature/) | Papers, lit reviews, annotated bibliographies. Source material lives here or its citation does. |
| [`data/`](data/) | Datasets (gitignored). See [`data/README.md`](data/README.md) for the convention. |
| [`notebooks/`](notebooks/) | Analysis notebooks (Jupyter / Quarto / Observable / etc.). |
| [`findings/`](findings/) | Synthesized findings + write-ups. The output of the research. |

## Methodology

Lean on the bundled skills:

- `skills/deep-research-pattern` — the primary research methodology playbook
- `skills/eval-deep-research` — evaluating research outputs
- `skills/document-parsing` — extracting structure from source documents
- `skills/documentation` — Diátaxis docs methodology (for writing findings)
- `skills_private/lessons-learned` — friction-as-memory (capture surprises as you go)
- `skills_private/proposal-authoring` — when research drives a decision, write it up

## Memory pattern

When you finish a synthesis or surface a load-bearing insight, call `memory_write` with:

```json
{
  "name": "<slug-of-finding>",
  "record_type": "lesson",
  "project_tags": ["sde-extraction-dev"],
  "content": "<the finding + the evidence>",
  "why": "<why it matters; what decision it informs>"
}
```

That way future sessions recall it without re-reading every paper.
