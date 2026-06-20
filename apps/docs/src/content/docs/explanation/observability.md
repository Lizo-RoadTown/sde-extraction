---
title: Watch it work
description: You can watch the work happen step by step, and see how sure the system is at each point.
---

You do not have to take the result on trust. You can watch the work happen, step by step, and check it
yourself. This section explains what you are watching.

## The steps

```mermaid
flowchart LR
  A["Add paper,<br/>choose figure"] --> B["Identify<br/>variables"]
  B --> C["Match<br/>parameters"]
  C --> D["Lift each value<br/>with its source"]
  D --> E["Check for<br/>completeness"]
  E --> F["Re-draw<br/>the figure"]
  F --> G["Person<br/>reviews it"]
```

1. You add a paper. The system finds its figures and you choose the one you want the model for.
2. It identifies the **variables** in that figure (the quantities that change over time).
3. It matches the **parameters** (the constants). See [Parameters](/explanation/parameters/).
4. It lifts each value off the page **with its source** (the quote, the page, a fingerprint).
5. It checks the model for **completeness** against the figure.
6. It re-draws the figure from the model, to check it reproduces.
7. A **person reviews** the result before it is kept.

You can watch each step as it runs, and each step's result is recorded so you can come back to it.

## More in this section

- [How sure it is](/explanation/confidence/) — confidence is reported part by part, not as one number.
- [How it earns its confidence](/explanation/agent-health/) — how a person's review becomes trust over time.
- [Where the data flows](/explanation/extraction-health/) — every place the data rests and moves.

To follow one paper through all of this, read [Follow a paper, step by step](/start/reproduce/).
