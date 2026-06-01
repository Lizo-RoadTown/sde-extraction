# notebooks/

Analysis notebooks (Jupyter / Quarto / Observable / etc.).

## Convention

- Name with date + topic: `YYYY-MM-DD-<topic>.ipynb`
- Each notebook's top cell: title, date, purpose, dataset(s) referenced (relative paths), key findings (one paragraph)
- `.ipynb_checkpoints/` is gitignored
- If outputs are large, clear cell outputs before committing (or use `nbstripout`)

When a notebook's findings stabilize, write them up in `research/findings/` as a markdown synthesis. The notebook becomes the reproducibility artifact; the finding write-up is the durable record.
