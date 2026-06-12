import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import {
  uploadPaper, enqueueJob, loadWorkItems, loadExtraction,
  type UploadedPaper, type JobTarget, type WorkItem,
} from "../data";
import { supabaseConfigured } from "../lib/supabase";
import type { FigureExtraction } from "../types";
import { Detail } from "./Verify";

// One surface for the whole work motion: add a paper, then verify what the engine
// did with it. No pipeline-stage theater or aggregate counters — a paper's status
// is a small per-row label (the only states the human acts on), and clicking a
// reviewable item opens the verifier inline.

type UploadState =
  | { kind: "idle" }
  | { kind: "working"; step: string; filename: string }
  | { kind: "done"; paper: UploadedPaper }
  | { kind: "error"; message: string };

type TargetMode = "auto" | "figure" | "model" | "whole";
const TARGET_MODES: { key: TargetMode; label: string; blurb: string }[] = [
  { key: "auto", label: "Auto-detect", blurb: "engine finds the model · you verify" },
  { key: "figure", label: "By figure", blurb: "you name the figure to target" },
  { key: "model", label: "By model", blurb: "you describe the model to find" },
  { key: "whole", label: "Whole paper", blurb: "extract everything the engine finds" },
];

const STATUS_LABEL = { extracting: "extracting", needs_review: "needs review", failed: "failed" } as const;
const STATUS_TONE = { extracting: "cyan", needs_review: "amber", failed: "red" } as const;

export function Papers() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [open, setOpen] = useState<FigureExtraction | null>(null);

  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TargetMode>("auto");
  const [figureRef, setFigureRef] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const [enqueued, setEnqueued] = useState<string | null>(null);

  const refresh = () => loadWorkItems().then(setItems);
  useEffect(() => { refresh(); }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUpload({ kind: "error", message: "Not a PDF — the only accepted input is a paper PDF." });
      return;
    }
    try {
      setUpload({ kind: "working", step: "fingerprinting", filename: file.name });
      const paper = await uploadPaper(file);
      setUpload({ kind: "done", paper });
    } catch (e) {
      setUpload({ kind: "error", message: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  const paperId = upload.kind === "done" ? upload.paper.paperId : null;

  async function startExtraction() {
    if (!paperId) return;
    const target: JobTarget =
      mode === "figure" ? { mode, figure_ref: figureRef }
      : mode === "model" ? { mode, model_desc: modelDesc }
      : { mode };
    const label = mode === "figure" ? (figureRef || "(figure)") : mode === "auto" ? "(auto)" : `(${mode})`;
    const ok = await enqueueJob(paperId, label, target);
    setEnqueued(ok ? "Queued — it’ll appear below as the engine works." : "Queue failed (signed in?).");
    setUpload({ kind: "idle" });
    refresh();
  }

  async function openItem(it: WorkItem) {
    if (!it.extractionId) return; // only reviewable items open the verifier
    const ext = await loadExtraction(it.extractionId);
    if (ext) setOpen(ext);
  }

  // When verifying, show the verifier full-width with a back link.
  if (open) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <button type="button" onClick={() => { setOpen(null); refresh(); }}
          className="self-start text-sm text-active hover:underline">← back to papers</button>
        <Detail key={open.id} ext={open} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Add a paper, then verify what the engine extracted. A PDF is the only input — fingerprinted (SHA-256) the moment it lands.">
        Papers
      </SectionTitle>

      {/* add a paper */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <input ref={fileInput} type="file" accept="application/pdf,.pdf"
            aria-label="Choose a paper PDF to upload" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <Card className={cx(
            "flex h-full flex-col items-center justify-center gap-2 border-dashed py-10 text-center transition",
            dragOver && "border-active-edge bg-active-soft",
          )}>
            {upload.kind === "working" ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-active" />
                <div className="text-sm text-ink">{upload.step}…</div>
                <div className="mono truncate text-xs text-ink-faint">{upload.filename}</div>
              </>
            ) : upload.kind === "done" ? (
              <>
                <Badge tone="green">fingerprinted</Badge>
                <div className="mono truncate text-xs text-ink-dim">sha256 {upload.paper.fileSha256.slice(0, 16)}…</div>
                <div className="truncate text-xs text-ink-faint">{upload.paper.filename}</div>
                {!supabaseConfigured && <div className="text-[11px] text-attention">not signed in — fingerprinted locally, not stored</div>}
              </>
            ) : (
              <>
                <div className="text-sm text-ink-dim">Drop a paper PDF here</div>
                <div className="text-xs text-ink-faint">or click to browse · fingerprinted on upload</div>
                {upload.kind === "error" && <div className="text-xs text-invalid" role="alert">{upload.message}</div>}
                <button type="button" onClick={() => fileInput.current?.click()}
                  className="mt-2 rounded-md bg-active-soft px-3 py-1.5 text-sm text-active hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
                  Choose PDF
                </button>
              </>
            )}
          </Card>
        </div>

        {/* what to extract */}
        <Card>
          <div className="mb-3 text-sm font-medium text-ink">What should the engine extract?</div>
          <div className="mb-1 flex gap-1 rounded-lg bg-inset p-1">
            {TARGET_MODES.map((m) => (
              <button type="button" key={m.key} onClick={() => setMode(m.key)}
                className={cx("flex-1 rounded-md px-2 py-1.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active",
                  mode === m.key ? "bg-active-soft text-active" : "text-ink-dim hover:text-ink")}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="mb-3 text-[11px] text-ink-faint">{TARGET_MODES.find((m) => m.key === mode)!.blurb}</div>

          {mode === "figure" && (
            <input value={figureRef} onChange={(e) => setFigureRef(e.target.value)} placeholder="e.g. Figure 2, or p.12"
              className="w-full rounded-md border border-edge bg-surface-raised/40 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-active" />
          )}
          {mode === "model" && (
            <textarea value={modelDesc} onChange={(e) => setModelDesc(e.target.value)} rows={2}
              placeholder="describe the model — e.g. 'the stochastic SIR with Ornstein–Uhlenbeck noise'"
              className="w-full rounded-md border border-edge bg-surface-raised/40 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-active" />
          )}
          {(mode === "auto" || mode === "whole") && (
            <div className="rounded-md border border-dashed border-edge px-3 py-3 text-center text-xs text-ink-faint">
              {mode === "auto" ? "The engine detects the model and you verify it." : "The engine extracts every model it finds."}
            </div>
          )}

          <button type="button" onClick={startExtraction} disabled={!paperId}
            title={paperId ? undefined : "Upload a paper first"}
            className="mt-3 w-full rounded-md bg-active-soft py-2 text-sm text-active transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            Extract →
          </button>
          {enqueued && <div className="mt-2 text-center text-xs text-ink-dim">{enqueued}</div>}
        </Card>
      </div>

      {/* the work list — real status, click a reviewable one to verify */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Your papers</span>
          <button type="button" onClick={refresh} className="text-xs text-ink-dim hover:text-ink">refresh</button>
        </div>
        {items.length === 0 ? (
          <Card className="py-10 text-center text-sm text-ink-faint">
            No papers in progress. Add one above — it’ll appear here as the engine works, then you verify it.
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => {
              const reviewable = it.status === "needs_review";
              return (
                <button
                  type="button"
                  key={it.key}
                  onClick={() => openItem(it)}
                  disabled={!reviewable}
                  className={cx(
                    "flex items-center justify-between gap-4 rounded-md border border-edge bg-surface-raised/40 px-4 py-3 text-left transition",
                    reviewable ? "hover:border-active-edge focus-visible:outline focus-visible:outline-2 focus-visible:outline-active" : "cursor-default opacity-80",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{it.paperTitle}</div>
                    <div className="text-xs text-ink-faint">{it.figureLabel}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                    {reviewable && <span className="text-xs text-active">verify →</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
