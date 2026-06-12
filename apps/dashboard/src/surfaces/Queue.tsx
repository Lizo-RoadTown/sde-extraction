import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import { loadWorkItems, type WorkItem } from "../data";
import { Link } from "../router";

// Page 2 — the batch queue. Everything in flight or awaiting review, across all papers.
// Each reviewable item links to its OWN page (#/verify/:id), so opening one is a real
// navigation: the browser Back button returns you here. This is the path for doing many
// papers; for a single paper, the Single-run page does the whole motion inline.

const STATUS_LABEL = { extracting: "extracting", needs_review: "needs review", failed: "failed" } as const;
const STATUS_TONE = { extracting: "cyan", needs_review: "amber", failed: "red" } as const;

export function Queue() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => { setLoading(true); loadWorkItems().then((i) => { setItems(i); setLoading(false); }); };
  useEffect(() => { refresh(); }, []);

  const reviewable = items.filter((i) => i.status === "needs_review").length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Every paper in flight or awaiting review. Click one that needs review to open its own verify page — Back brings you right back here.">
        Queue
      </SectionTitle>

      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-ink-dim">
          {reviewable > 0 ? `${reviewable} awaiting review` : "nothing awaiting review"}
        </span>
        <button type="button" onClick={refresh} className="text-xs text-ink-dim hover:text-ink">refresh</button>
      </div>

      {loading ? (
        <Card className="py-10 text-center text-sm text-ink-faint">loading…</Card>
      ) : items.length === 0 ? (
        <Card className="py-10 text-center text-sm text-ink-faint">
          The queue is empty. Add papers from the Single-run page — they’ll show up here as the engine works.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const canOpen = it.status === "needs_review" && it.extractionId;
            const row = (
              <div className={cx(
                "flex items-center justify-between gap-4 rounded-md border border-edge bg-surface-raised/40 px-4 py-3",
                canOpen ? "transition hover:border-active-edge" : "opacity-80",
              )}>
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{it.paperTitle}</div>
                  <div className="text-xs text-ink-faint">{it.figureLabel}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                  {canOpen && <span className="text-xs text-active">verify →</span>}
                </div>
              </div>
            );
            return canOpen ? (
              <Link key={it.key} to={`/verify/${it.extractionId}`}
                className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
                {row}
              </Link>
            ) : (
              <div key={it.key}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
