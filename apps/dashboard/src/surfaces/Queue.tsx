import { useRef, useState, useEffect } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import { loadWorkItems, uploadPaper, enqueueJob, type WorkItem } from "../data";
import { Link } from "../router";

// Page 2 — the batch queue. Everything in flight or awaiting review, across all papers.
// Each reviewable item links to its OWN page (#/verify/:id), so opening one is a real
// navigation: Back returns you here. Intake lives behind "Deploy ▾" — a source map of
// where the extractor plugs in. PDF upload is wired today; the rest are planned targets
// shown so the interface accounts for what's coming.

const STATUS_LABEL = { extracting: "extracting", needs_review: "needs review", failed: "failed" } as const;
const STATUS_TONE = { extracting: "cyan", needs_review: "amber", failed: "red" } as const;

// The places we plan to wire the extractor. `live` is functional now; `planned` are
// disabled placeholders — the roadmap, made visible.
type SourceKey = "upload" | "doi" | "pubmed" | "arxiv";
const SOURCES: { key: SourceKey; label: string; state: "live" | "planned"; blurb: string }[] = [
  { key: "upload", label: "Upload PDFs", state: "live", blurb: "drop many PDFs · each becomes its own job" },
  { key: "doi", label: "DOI · Crossref-TDM", state: "planned", blurb: "fetch a retained snapshot at the source" },
  { key: "pubmed", label: "PubMed", state: "planned", blurb: "by PMID or query" },
  { key: "arxiv", label: "arXiv", state: "planned", blurb: "by arXiv id or listing" },
];

// One file's progress through the batch ingest.
type BatchFile = { name: string; status: "pending" | "uploading" | "queued" | "error"; message?: string };

export function Queue() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [source, setSource] = useState<SourceKey | null>(null); // the opened intake panel
  const [batch, setBatch] = useState<BatchFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => { setLoading(true); loadWorkItems().then((i) => { setItems(i); setLoading(false); }); };
  useEffect(() => { refresh(); }, []);

  const reviewable = items.filter((i) => i.status === "needs_review").length;

  // Batch ingest: fingerprint + enqueue each PDF as its own auto-target job, sequentially
  // (one upload at a time keeps the progress list honest and avoids hammering storage).
  async function handleBatch(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (list.length === 0) return;
    setBatch(list.map((f) => ({ name: f.name, status: "pending" })));
    for (let i = 0; i < list.length; i++) {
      setBatch((prev) => prev.map((b, j) => (j === i ? { ...b, status: "uploading" } : b)));
      try {
        const paper = await uploadPaper(list[i]);
        if (!paper.paperId) throw new Error("not signed in — not stored");
        const jobId = await enqueueJob(paper.paperId, "(auto)", { mode: "auto", lane: "bulk" });
        setBatch((prev) => prev.map((b, j) =>
          j === i ? { ...b, status: jobId ? "queued" : "error", message: jobId ? undefined : "queue failed" } : b));
      } catch (e) {
        setBatch((prev) => prev.map((b, j) =>
          j === i ? { ...b, status: "error", message: e instanceof Error ? e.message : "failed" } : b));
      }
    }
    refresh();
  }

  const queuedCount = batch.filter((b) => b.status === "queued").length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle hint="The fast lane: deploy or upload in bulk, let it run silently, come back and rip through verifications. No walkthrough — click an item that needs review to verify it directly.">
          Bulk
        </SectionTitle>

        {/* Deploy ▾ — the source map: where the extractor plugs in. */}
        <div className="relative shrink-0">
          <button type="button" onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md bg-active-soft px-3 py-2 text-sm text-active transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
            Deploy ▾
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-edge bg-inset p-1 shadow-lg">
              <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-ink-faint">extraction sources</div>
              {SOURCES.map((s) => {
                const live = s.state === "live";
                return (
                  <button
                    type="button"
                    key={s.key}
                    disabled={!live}
                    onClick={() => { if (live) { setSource(s.key); setMenuOpen(false); } }}
                    className={cx(
                      "flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition",
                      live ? "hover:bg-surface-raised/70" : "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span>
                      <span className="block text-sm text-ink">{s.label}</span>
                      <span className="block text-[11px] text-ink-faint">{s.blurb}</span>
                    </span>
                    {live
                      ? <Badge tone="green">live</Badge>
                      : <span className="mt-0.5 rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] text-ink-faint">planned</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* intake panel — opens when a live source is chosen from Deploy ▾ */}
      {source === "upload" && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Batch upload — PDFs</span>
            <button type="button" onClick={() => { setSource(null); setBatch([]); }}
              className="text-xs text-ink-dim hover:text-ink">close</button>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleBatch(e.dataTransfer.files); }}
          >
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple
              aria-label="Choose paper PDFs to upload" className="hidden"
              onChange={(e) => handleBatch(e.target.files)} />
            <div className={cx(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center transition",
              dragOver ? "border-active-edge bg-active-soft" : "border-edge",
            )}>
              <div className="text-sm text-ink-dim">Drop multiple PDFs here</div>
              <div className="text-xs text-ink-faint">each is fingerprinted and queued as its own auto-target job</div>
              <button type="button" onClick={() => fileInput.current?.click()}
                className="mt-1 rounded-md bg-active-soft px-3 py-1.5 text-sm text-active hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
                Choose PDFs
              </button>
            </div>
          </div>
          {batch.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-xs text-ink-faint">{queuedCount}/{batch.length} queued</div>
              {batch.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded border border-edge/60 px-3 py-1.5">
                  <span className="mono truncate text-xs text-ink-dim">{b.name}</span>
                  {b.status === "queued" ? <Badge tone="green">queued</Badge>
                    : b.status === "error" ? <Badge tone="red">{b.message ?? "error"}</Badge>
                    : <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-active" />{b.status}
                      </span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

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
          The queue is empty. Use <span className="text-ink-dim">Deploy ▾</span> to batch-ingest papers, or add one from the Single-run page.
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
