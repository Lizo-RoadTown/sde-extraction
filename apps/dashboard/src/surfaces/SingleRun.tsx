import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import {
  uploadPaper, enqueueJob, loadJobStage, loadLatestExtraction,
  type UploadedPaper, type JobTarget,
} from "../data";
import { supabaseConfigured } from "../lib/supabase";
import { Link } from "../router";
import type { FigureExtraction } from "../types";
import { Detail } from "./Verify";

// Page 1 — a single paper, end to end, without ever leaving: upload → choose what to
// extract → run → watch progress → verify the result inline. For one paper you do the
// whole motion here. Batches go through the Queue page instead (its own URL).

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

// The single run's lifecycle once the user presses Extract.
type RunPhase =
  | { kind: "compose" }
  | { kind: "running"; jobId: string; paperId: string; stage: string }
  | { kind: "done"; ext: FigureExtraction }
  | { kind: "failed"; message: string };

const STAGE_LABEL: Record<string, string> = {
  queued: "queued — waiting for the worker to pick it up",
  extract: "extracting — reading the PDF and asking the model",
  machine_verify: "machine-verifying the result",
  stored: "stored",
};

export function SingleRun() {
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TargetMode>("auto");
  const [figureRef, setFigureRef] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const [phase, setPhase] = useState<RunPhase>({ kind: "compose" });

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
      mode === "figure" ? { mode, figure_ref: figureRef, lane: "walkthrough" }
      : mode === "model" ? { mode, model_desc: modelDesc, lane: "walkthrough" }
      : { mode, lane: "walkthrough" };
    const label = mode === "figure" ? (figureRef || "(figure)") : mode === "auto" ? "(auto)" : `(${mode})`;
    const jobId = await enqueueJob(paperId, label, target);
    if (!jobId) { setPhase({ kind: "failed", message: "Couldn't queue the job — are you signed in?" }); return; }
    setPhase({ kind: "running", jobId, paperId, stage: "queued" });
  }

  function reset() {
    setPhase({ kind: "compose" });
    setUpload({ kind: "idle" });
  }

  // Poll the job while it runs. A real extraction is worker-poll (≤30s) + the OpenAI call,
  // so this can take up to ~a minute; we surface the stage as it advances and flip to the
  // inline verifier the moment the worker stores the result.
  const runningJobId = phase.kind === "running" ? phase.jobId : null;
  useEffect(() => {
    if (phase.kind !== "running") return;
    const { jobId, paperId } = phase;
    let cancelled = false;
    const tick = async () => {
      const s = await loadJobStage(jobId);
      if (cancelled || !s) return;
      if (s.stage === "failed") {
        setPhase({ kind: "failed", message: s.error || "The extraction job failed." });
        return;
      }
      if (s.stage === "stored") {
        const ext = await loadLatestExtraction(paperId);
        if (cancelled) return;
        setPhase(ext ? { kind: "done", ext } : { kind: "failed", message: "Stored, but the extraction couldn't be loaded." });
        return;
      }
      setPhase((p) => (p.kind === "running" ? { ...p, stage: s.stage } : p));
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningJobId]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <SectionTitle hint="Walk the whole process: add a paper, watch the engine search the page for what the figure needed, and verify the result — with the proof in view. New here or want to see how it works? Start here. Doing many at once? Use Bulk.">
        Walkthrough
      </SectionTitle>

      {/* compose — upload + targeting. Disabled while a run is in flight. */}
      <fieldset disabled={phase.kind === "running"} className={cx(phase.kind === "running" && "opacity-60")}>
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
          </Card>
        </div>
      </fieldset>

      {/* the run — progress, then the verifier inline, or an error */}
      {phase.kind === "running" && (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-active" />
          <div className="text-sm text-ink">{STAGE_LABEL[phase.stage] ?? phase.stage}</div>
          <div className="text-xs text-ink-faint">Up to a minute — the worker polls, then the model reads the paper.</div>
          <div className="mt-1 rounded-md bg-active-soft px-3 py-1.5 text-[11px] text-active">
            Stay on this page — your guided walkthrough (the page search + verify) opens right here when it’s ready.
          </div>
          <div className="text-[11px] text-ink-faint">Need to do many? <span className="text-ink-dim">Bulk</span> runs silently and you review later.</div>
        </Card>
      )}

      {phase.kind === "failed" && (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <Badge tone="red">failed</Badge>
          <div className="text-sm text-ink-dim">{phase.message}</div>
          <button type="button" onClick={reset}
            className="rounded-md bg-surface-raised px-3 py-1.5 text-sm text-ink hover:bg-edge">start over</button>
        </Card>
      )}

      {phase.kind === "done" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Verify this extraction</span>
            <div className="flex items-center gap-3">
              <Link to={`/verify/${phase.ext.id}`} className="text-xs text-ink-dim hover:text-ink">open as its own page ↗</Link>
              <button type="button" onClick={reset} className="text-xs text-active hover:underline">+ new paper</button>
            </div>
          </div>
          <Detail key={phase.ext.id} ext={phase.ext} walkthrough />
        </div>
      )}
    </div>
  );
}
