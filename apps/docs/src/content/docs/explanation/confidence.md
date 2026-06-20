---
title: How sure it is
description: Today each extraction shows its real completeness — how many required fields came back present vs absent. A per-type earned-confidence score is planned.
---

## What you see today: completeness

Each extraction shows its **completeness** — how many of the fields the figure needs came back
**present** vs **absent**, read straight from the result (e.g. `12/18`). This is a real count, not a
score: it tells you how much of the model was found, and the absent slots tell you exactly what to
check. A value that was located on the page also shows that (see
[The magnifying glass](/explanation/magnifying-glass/)).

This is honest about what's known: it does **not** claim how *likely-correct* a value is — only whether
it was found, and whether it was traced to a spot on the page.

## Planned: earned, per-type confidence

:::note[Planned — not built yet]
The mechanism below is the intended design. There is no confidence-scoring code in the system today;
the dashboard shows completeness (above), not an earned score.
:::

The plan is a score that is **earned, not assigned**: every time a person reviews a result and confirms
or corrects it, that verdict would raise or lower the confidence for that *kind* of work, so the numbers
reflect a real track record that improves as more papers are reviewed. For the intended feedback path
and what actually runs today, see [How it earns its confidence](/explanation/agent-health/).
