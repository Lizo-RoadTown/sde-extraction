# data/

Datasets used for analysis.

## Convention

- **This entire directory is gitignored** (except this README and `.gitkeep`).
- Large or proprietary datasets stay on local disk; don't push them to GitHub.
- Document each dataset with a `<dataset-name>.md` sibling note that describes:
  - Source URL or origin
  - Schema / fields
  - Size + format
  - License + access constraints
  - Where it lives on disk (relative or absolute path)
  - How to reproduce its acquisition (script reference or manual steps)

When a dataset is small + open + critical for the work, you can override the gitignore for it by adding a specific exception to `.gitignore`. Default: keep it out.
