import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import {
  uploadPaper, enqueueJob, loadJobStage, loadLatestExtraction,
  type UploadedPaper, type JobTarget,
} from "../data";
import { supabaseConfigured } from "../lib/supabase";
import { Link } from "../router";
import { detectFigures, type DetectedFigure } from "../figures";
import type { FigureExtraction } from "../types";
import { Detail } from "./Verify";

// Page 1 — the guided Walkthrough. FIGURES FIRST: the moment a paper is uploaded, a script
// scans it and displays every figure; you choose one (or ask the agent to auto-detect), and
// only then does extraction run — with the spotlight search + verify, inline on this page.

type UploadState =
  | { kind: "idle" }
  | { kind: "working"; step: string; filename: string }
  | { kind: "done"; paper: UploadedPaper }
  | { kind: "error"; message: string };

const AUTO = "__auto__"; // the command: let the agent choose the figure

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

  // Stage 1 — figures detected on upload, displayed for the user to choose from.
  const [figures, setFigures] = useState<DetectedFigure[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null); // a figure label, or AUTO
  const [subfig, setSubfig] = useState(""); // the SINGLE sub-figure/panel that is the anchor (e.g. "bottom-left", "b")

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
      // Stage 1: detect + display the figures (deterministic, no LLM) so the user can choose.
      setDetecting(true); setFigures([]); setChosen(null); setSubfig("");
      try { setFigures(await detectFigures(file)); } catch { /* leave empty → auto */ }
      finally { setDetecting(false); }
    } catch (e) {
      setUpload({ kind: "error", message: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  const paperId = upload.kind === "done" ? upload.paper.paperId : null;

  // The anchor is ONE graphic: the chosen figure, narrowed to a single sub-figure/panel when given.
  const chosenFig = figures.find((f) => f.label === chosen) ?? null;
  const anchor = chosen && chosen !== AUTO
    ? (subfig.trim() ? `${chosen} (${subfig.trim()})` : chosen)
    : null;

  async function startExtraction() {
    if (!paperId || !chosen) return;
    const auto = chosen === AUTO;
    const ref = anchor ?? chosen;
    const target: JobTarget = auto
      ? { mode: "auto", lane: "walkthrough" }
      : { mode: "figure", figure_ref: ref, lane: "walkthrough" };
    const label = auto ? "(auto)" : ref;
    const jobId = await enqueueJob(paperId, label, target);
    if (!jobId) { setPhase({ kind: "failed", message: "Couldn't queue the job — are you signed in?" }); return; }
    setPhase({ kind: "running", jobId, paperId, stage: "queued" });
  }

  function reset() {
    setPhase({ kind: "compose" });
    setUpload({ kind: "idle" });
    setFigures([]); setChosen(null); setSubfig("");
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
      <SectionTitle hint="Walk the whole process: add a paper, choose which figure to reproduce, watch the engine search the page for what it needed, and verify — with the proof in view. New here or want to see how it works? Start here. Doing many at once? Use Bulk.">
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

          {/* Stage 1 — figures first: choose which one to reproduce */}
          <Card className="flex flex-col">
            <div className="mb-2 text-sm font-medium text-ink">Which figure do you want to reproduce?</div>
            {upload.kind !== "done" ? (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-edge py-8 text-center text-xs text-ink-faint">
                Upload a paper — its figures appear here to choose from.
              </div>
            ) : detecting ? (
              <div className="flex flex-1 items-center justify-center gap-2 py-8 text-xs text-ink-faint">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-active" /> finding figures…
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {/* auto-detect — the command to let the agent choose */}
                <button type="button" onClick={() => setChosen(AUTO)}
                  className={cx("rounded-md border px-3 py-2 text-left text-sm transition",
                    chosen === AUTO ? "border-active-edge bg-active-soft text-active" : "border-edge bg-surface-raised/40 text-ink-dim hover:text-ink")}>
                  <div className="font-medium">Auto-detect</div>
                  <div className="text-[11px] text-ink-faint">let the agent choose the figure to extract</div>
                </button>
                {figures.length === 0 ? (
                  <div className="rounded-md border border-dashed border-edge px-3 py-3 text-center text-[11px] text-ink-faint">
                    No figure captions detected in the text — use Auto-detect.
                  </div>
                ) : (
                  figures.map((f) => (
                    <button type="button" key={f.label} onClick={() => setChosen(f.label)}
                      className={cx("flex gap-3 rounded-md border px-3 py-2 text-left transition",
                        chosen === f.label ? "border-active-edge bg-active-soft" : "border-edge bg-surface-raised/40 hover:border-active-edge")}>
                      {f.thumb && <img src={f.thumb} alt={f.label} className="h-20 w-16 shrink-0 rounded border border-edge bg-white object-cover object-top" />}
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{f.label}</span>
                          <Badge tone="slate">p.{f.page}</Badge>
                        </div>
                        {f.caption && <div className="mt-0.5 line-clamp-3 text-[11px] text-ink-faint">{f.caption}</div>}
                      </div>
                    </button>
                  ))
                )}
                {/* anchor on ONE graphic — narrow a multi-panel figure to a single sub-figure */}
                {chosen && chosen !== AUTO && (
                  <div className="rounded-md border border-active-edge/50 bg-active-soft/20 px-3 py-2">
                    <div className="mb-1 text-[11px] text-ink-dim">
                      Anchor on <span className="text-ink">one</span> graphic — if {chosen} is a multi-panel page, name the single panel:
                    </div>
                    {chosenFig?.subfigures?.length ? (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {chosenFig.subfigures.map((s) => (
                          <button type="button" key={s} onClick={() => setSubfig(subfig === s ? "" : s)}
                            className={cx("rounded px-2 py-0.5 text-[11px] transition",
                              subfig === s ? "bg-active-soft text-active" : "bg-surface-raised text-ink-dim hover:text-ink")}>
                            ({s})
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <input value={subfig} onChange={(e) => setSubfig(e.target.value)}
                      placeholder="e.g. bottom-left · panel (b) · the σ=3.9 plot"
                      className="w-full rounded-md border border-edge bg-surface-raised/40 px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-active" />
                    <div className="mt-1 text-[10px] text-ink-faint">
                      anchor: <span className="text-ink-dim">{anchor}</span>{!subfig.trim() && " — whole figure (leave blank only if it’s a single model)"}
                    </div>
                  </div>
                )}
                <button type="button" onClick={startExtraction} disabled={!paperId || !chosen}
                  title={!chosen ? "Choose a figure or Auto-detect" : undefined}
                  className="mt-2 w-full rounded-md bg-active-soft py-2 text-sm text-active transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                  Extract {anchor ?? ""} →
                </button>
              </div>
            )}
          </Card>
        </div>
      </fieldset>

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
