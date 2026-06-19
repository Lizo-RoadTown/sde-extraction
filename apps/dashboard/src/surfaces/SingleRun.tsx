import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import {
  uploadPaper, enqueueJob, loadJobStage, loadLatestExtraction, loadDetectedFigures,
  type UploadedPaper, type JobTarget,
} from "../data";
import { renderFigureThumbs, type FigureThumb } from "../cropFigures";
import { supabaseConfigured } from "../lib/supabase";
import { Link } from "../router";
import { Loader } from "./Loader";
import type { FigureExtraction } from "../types";
import { Detail } from "./Verify";

// Page 1 — the guided Walkthrough. The system FINDS the figures (server-side PyMuPDF detector, the
// same one used for extraction), shows their real cropped images, and the HUMAN picks one. The pick
// drives a figure-mode extraction of exactly that figure. No auto-pick, no ranking — the human chooses.

type UploadState =
  | { kind: "idle" }
  | { kind: "working"; step: string; filename: string }
  | { kind: "done"; paper: UploadedPaper }
  | { kind: "error"; message: string };

type RunPhase =
  | { kind: "compose" }
  | { kind: "detecting"; jobId: string; paperId: string }            // finding the figures
  | { kind: "choosing"; paperId: string; figures: FigureThumb[] }    // human picks one
  | { kind: "running"; jobId: string; paperId: string; stage: string } // extracting the pick
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
  const [file, setFile] = useState<File | null>(null); // kept so the chooser can render real crops
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<RunPhase>({ kind: "compose" });
  const [zoom, setZoom] = useState<FigureThumb | null>(null); // the panel being inspected (zoom view)

  async function handleFile(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setUpload({ kind: "error", message: "Not a PDF — the only accepted input is a paper PDF." });
      return;
    }
    try {
      setUpload({ kind: "working", step: "fingerprinting", filename: f.name });
      const paper = await uploadPaper(f);
      setUpload({ kind: "done", paper });
      setFile(f);
      // Not signed in / mock mode: fingerprinted locally but not stored, so the pipeline can't run.
      if (!paper.paperId) return;
      // The system finds the figures (a detect job runs the server-side detector). The human then picks.
      const jobId = await enqueueJob(paper.paperId, "(detect)", { mode: "detect", lane: "walkthrough" });
      if (!jobId) { setPhase({ kind: "failed", message: "Couldn't queue figure detection — are you signed in?" }); return; }
      setPhase({ kind: "detecting", jobId, paperId: paper.paperId });
    } catch (e) {
      setUpload({ kind: "error", message: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  // Human picks ONE panel → extract exactly THAT panel (anchored by its region/bbox, not the label,
  // since panels share a caption).
  async function choose(f: FigureThumb) {
    if (phase.kind !== "choosing") return;
    const label = f.label || `panel (p.${f.page})`;
    const target: JobTarget = {
      mode: "figure", figure_ref: label, lane: "walkthrough",
      region: { page: f.page, bbox_norm: f.bbox_norm },
    };
    const jobId = await enqueueJob(phase.paperId, label, target);
    if (!jobId) { setPhase({ kind: "failed", message: "Couldn't queue the extraction — are you signed in?" }); return; }
    setZoom(null);
    setPhase({ kind: "running", jobId, paperId: phase.paperId, stage: "queued" });
  }

  function reset() {
    setPhase({ kind: "compose" });
    setUpload({ kind: "idle" });
    setFile(null);
  }

  // One poller for both the detect job and the extract job (they have distinct job ids).
  const pollJobId = phase.kind === "detecting" || phase.kind === "running" ? phase.jobId : null;
  useEffect(() => {
    if (phase.kind !== "detecting" && phase.kind !== "running") return;
    const detecting = phase.kind === "detecting";
    const jobId = phase.jobId;
    const paperId = phase.paperId;
    let cancelled = false;
    const tick = async () => {
      const s = await loadJobStage(jobId);
      if (cancelled || !s) return;
      if (s.stage === "failed") { setPhase({ kind: "failed", message: s.error || "The job failed." }); return; }
      if (s.stage === "stored") {
        if (detecting) {
          const figs = await loadDetectedFigures(paperId);
          if (cancelled) return;
          if (!figs || figs.length === 0) {
            setPhase({ kind: "failed", message: "No figures were detected in this PDF." });
            return;
          }
          const thumbs = file ? await renderFigureThumbs(file, figs) : figs.map((f) => ({ ...f }));
          if (cancelled) return;
          setPhase({ kind: "choosing", paperId, figures: thumbs });
        } else {
          const ext = await loadLatestExtraction(paperId);
          if (cancelled) return;
          setPhase(ext ? { kind: "done", ext } : { kind: "failed", message: "Stored, but the extraction couldn't be loaded." });
        }
        return;
      }
      if (!detecting) setPhase((p) => (p.kind === "running" ? { ...p, stage: s.stage } : p));
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollJobId]);

  const busy = phase.kind === "detecting" || phase.kind === "running";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <SectionTitle hint="Walk the whole process: add a paper, the system finds its figures, you pick the one to reproduce, and watch the engine search the page for what it needed — verify with the proof in view. New here? Start here. Doing many at once? Use Bulk.">
        Walkthrough
      </SectionTitle>

      <fieldset disabled={busy} className={cx(busy && "opacity-60")}>
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

          {/* the system finds the figures; the human picks one */}
          <Card className="flex flex-col">
            <div className="mb-2 text-sm font-medium text-ink">Which figure do you want to reproduce?</div>
            {upload.kind !== "done" ? (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-edge py-8 text-center text-xs text-ink-faint">
                Upload a paper — the figures it finds appear here to choose from.
              </div>
            ) : phase.kind === "detecting" ? (
              <div className="flex flex-1 items-center justify-center gap-2 py-8 text-xs text-ink-faint">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-active" /> finding the figures…
              </div>
            ) : phase.kind === "choosing" ? (
              <div className="flex flex-col gap-2">
                <div className="text-[11px] text-ink-faint">
                  The system found these panels in the paper. Click one to zoom in and inspect it, then extract its model.
                </div>
                <div className="grid max-h-[30rem] grid-cols-2 gap-2 overflow-auto pr-1">
                  {phase.figures.map((f, i) => {
                    const label = f.label || `Figure (p.${f.page})`;
                    return (
                      <button type="button" key={`${f.label ?? "fig"}-${f.page}-${i}`}
                        onClick={() => setZoom(f)}
                        title="Click to zoom in and inspect"
                        className="flex flex-col gap-1 rounded-md border border-edge bg-surface-raised/40 p-2 text-left transition hover:border-active-edge">
                        {f.thumb ? (
                          <img src={f.thumb} alt={label} className="h-28 w-full rounded border border-edge bg-white object-contain" />
                        ) : (
                          <div className="flex h-28 items-center justify-center rounded border border-dashed border-edge text-[10px] text-ink-faint">no preview</div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-ink">{label}</span>
                          <Badge tone="slate">p.{f.page}</Badge>
                        </div>
                        {f.caption && <div className="line-clamp-2 text-[10px] text-ink-faint">{f.caption}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-8 text-center text-xs text-ink-faint">
                {phase.kind === "running" ? "extracting your chosen figure…" : "—"}
              </div>
            )}
          </Card>
        </div>
      </fieldset>

      {/* zoom: inspect one panel up close — what it is + extract it */}
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 overflow-auto rounded-lg border border-edge bg-surface p-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{zoom.label || `Figure (p.${zoom.page})`}</span>
              <button type="button" onClick={() => setZoom(null)} className="text-xs text-ink-dim hover:text-ink">close ✕</button>
            </div>
            {zoom.thumb ? (
              <img src={zoom.thumb} alt={zoom.label || "panel"} className="max-h-[60vh] w-full rounded border border-edge bg-white object-contain" />
            ) : (
              <div className="flex h-64 items-center justify-center rounded border border-dashed border-edge text-xs text-ink-faint">no preview</div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              <Badge tone="slate">p.{zoom.page}</Badge>
              <span>this is one panel of {zoom.label?.split(" · ")[0] || "the figure"}</span>
            </div>
            {zoom.caption && (
              <div className="rounded-md bg-surface-raised/40 p-2 text-xs text-ink-dim">
                <span className="text-ink-faint">what it relates to: </span>{zoom.caption}
              </div>
            )}
            <button type="button" onClick={() => choose(zoom)}
              className="mt-1 w-full rounded-md bg-active-soft py-2 text-sm text-active transition hover:brightness-110">
              Extract this panel →
            </button>
          </div>
        </div>
      )}

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
