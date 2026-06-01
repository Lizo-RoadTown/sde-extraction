# findings/

Synthesized findings + write-ups. The output of the research.

## Convention

- Name with date + slug: `YYYY-MM-DD-<slug>.md`
- Each finding: title, date, status (`draft` | `stable` | `superseded-by:<other>`), the claim, the evidence (cite notebooks + papers), implications for next decisions
- Use `skills/documentation` (Diátaxis pattern) and `skills/layered-explanation` (ELI5 → quick → depth → mental model) for structure
- For ones that should be promoted to durable platform memory: also `memory_write` with `record_type="lesson"` + `project_tags=["sde-extraction-dev"]`

When a finding directly drives an architecture or scope decision, also write an ADR at `docs/decisions/<NNN>-<title>.md` referencing this finding.
