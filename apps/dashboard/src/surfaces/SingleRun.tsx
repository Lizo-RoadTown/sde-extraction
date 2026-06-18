import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import {
  uploadPaper, enqueueJob, loadJobStage, loadLatestExtraction,
  type UploadedPaper, type JobTarget,
} from "../data";
import { supabaseConfigured } from "../lib/supabase";
import { Link } from "../router";
import { Loader } from "./Loader";
import type { FigureExtraction } from "../types";
import { Detail } from "./Verify";

// Page 1 — the guided Walkthrough. Upload a paper, then extract: the engine isolates the figure it
// reproduces (real, server-side detection — no in-browser figure guessing) and searches the page for
// what it needed, present/absent, with the proof in view — all inline on this page.

type UploadState =
  | { kind: "idle" }
  | { kind: "working"; step: string; filename: string }
  | { kind: "done"; paper: UploadedPaper }
  | { kind: "error"; message: string };

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
    // Auto: the engine isolates the figure it reproduces (real, server-side detection).
    const target: JobTarget = { mode: "auto", lane: "walkthrough" };
    const jobId = await enqueueJob(paperId, "(auto)", target);
    if (!jobId) { setPhase({ kind: "failed", message: "Couldn't queue the job — are you signed in?" }); return; }
    setPhase({ kind: "running", jobId, paperId, stage: "queued" });
  }

  function reset() {
    setPhase({ kind: "compose" });
    setUpload({ kind: "idle" });
  }

  const runningJobId = phase.kind === "running" ? phase.jobId : null;
  useEffect(() => {
    if (phase.kind !== "running") return;
    const { jobId, paperId } = phase;
    let cancelled = false;
    const tick = async () => {
      const s = await loadJobStage(jobId);
      if (cancelled || !s) return;
      if (s.stage === "failed") { setPhase({ kind: "failed", message: s.error || "The extraction job failed." }); return; }
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
      <SectionTitle hint="Walk the whole process: add a paper, extract, and watch the engine isolate the figure it reproduces and search the page for what it needed — verify with the proof in view. New here or want to see how it works? Start here. Doing many at once? Use Bulk.">
        Walkthrough
      </SectionTitle>

      <fieldset disabled={phase.kind === "running"} className={cx(phase.kind === "running" && "opacity-60")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" aria-label="Choose a paper PDF to upload"
              className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
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

          {/* Extract — the engine isolates the figure it reproduces (real, server-side) */}
          <Card className="flex flex-col justify-center">
            <div className="mb-2 text-sm font-medium text-ink">Extract the figure’s model</div>
            {upload.kind !== "done" ? (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-edge py-8 text-center text-xs text-ink-faint">
                Upload a paper — the engine isolates the figure it reproduces and extracts its model.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-ink-faint">
                  The engine isolates the figure it reproduces from the paper, then searches the page
                  for what it needed to produce it — present or absent, with the source in view.
                </p>
                <button type="button" onClick={startExtraction} disabled={!paperId}
                  className="mt-1 w-full rounded-md bg-active-soft py-2 text-sm text-active transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                  Extract →
                </button>
              </div>
            )}
          </Card>
        </div>
      </fieldset>

      {phase.kind === "running" && (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader size={84} />
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
          <button type="button" onClick={reset} className="rounded-md bg-surface-raised px-3 py-1.5 text-sm text-ink hover:bg-edge">start over</button>
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
