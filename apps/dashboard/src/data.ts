// Single data layer: query Supabase and return REAL backend state. No mock fallback —
// the dashboard shows what's actually in the database, including honest empty states.
// (If Supabase isn't configured, these return empty; the AuthGate prevents that on
// the deployed site by requiring login first.)

import { supabase } from "./lib/supabase";
import { isPreview } from "./usePreview";
import { SAMPLE_ESCALATIONS } from "./preview";
import type { FigureExtraction, Job } from "./types";

// ---- PDF storage: fingerprint, upload, signed URL ----------------------------
// The PDF is the provenance root: it is SHA-256 fingerprinted the moment it lands,
// stored in the Supabase 'papers' bucket, and a row is written to `papers`.

const PAPERS_BUCKET = "papers";

/** SHA-256 of the exact file bytes — the fingerprint that anchors provenance. */
export async function fingerprintFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UploadedPaper {
  paperId: string | null; // null in mock mode (Supabase not configured)
  fileSha256: string;
  storagePath: string;
  filename: string;
}

/**
 * Fingerprint + upload a PDF to the 'papers' bucket and upsert a `papers` row.
 * In mock mode (no Supabase) it still fingerprints, so the UI is real locally.
 * Idempotent on the fingerprint: re-uploading the same PDF returns the same path.
 */
export async function uploadPaper(file: File): Promise<UploadedPaper> {
  const fileSha256 = await fingerprintFile(file);
  const storagePath = `${fileSha256}.pdf`;

  if (!supabase) {
    return { paperId: null, fileSha256, storagePath, filename: file.name };
  }

  const { error: upErr } = await supabase.storage
    .from(PAPERS_BUCKET)
    .upload(storagePath, file, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  // Upsert the provenance row keyed on the fingerprint (unique).
  const { data, error: rowErr } = await supabase
    .from("papers")
    .upsert(
      { file_sha256: fileSha256, filename: file.name, storage_path: storagePath, status: "uploaded" },
      { onConflict: "file_sha256" },
    )
    .select("id")
    .single();
  if (rowErr) throw new Error(`paper row failed: ${rowErr.message}`);

  return { paperId: String(data.id), fileSha256, storagePath, filename: file.name };
}

/** A time-limited URL the PDF viewer can render. Null in mock mode or if unset. */
export async function signedPdfUrl(storagePath: string, expiresInSec = 3600): Promise<string | null> {
  if (!supabase || !storagePath) return null;
  const { data, error } = await supabase.storage
    .from(PAPERS_BUCKET)
    .createSignedUrl(storagePath, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

function rowToExtraction(row: Record<string, unknown>): FigureExtraction {
  const m = (row.model ?? {}) as Partial<FigureExtraction> & Record<string, unknown>;
  const absent = { status: "absent", reason: "not_stated" } as const;
  return {
    id: String(row.id),
    figureLabel: (row.figure_label as string) ?? m.figureLabel ?? "",
    figureType: (m.figureType as string) ?? "",
    outcome: (m.outcome as string) ?? "",
    pathogen: (row.pathogen as string) ?? m.pathogen ?? "",
    doi: (row.doi as string) ?? m.doi ?? "",
    status: (row.status as FigureExtraction["status"]) ?? "needs_human",
    pdfUrl: (m.pdfUrl as string) ?? "#",
    variables: m.variables ?? [],
    parameters: m.parameters ?? [],
    driftTerms: m.driftTerms ?? [],
    diffusionTerms: m.diffusionTerms ?? [],
    timeSpan: m.timeSpan ?? { initialTime: absent, finalTime: absent },
    figureReproduced: (row.figure_reproduced as boolean | null) ?? null,
  };
}

// The Intake targeting choice that rides on a queued job (the worker's processor
// branches on target.mode — services/extraction/processor.py).
export interface JobTarget {
  mode: "auto" | "figure" | "model" | "whole";
  figure_ref?: string;
  model_desc?: string;
}

/**
 * Enqueue an extraction job the worker will drain. Inserts an `extraction_jobs` row
 * (status defaults to 'queued'; target carries the Intake mode) and returns the new job
 * id so the caller can poll it (the single-run page does this). Mock mode (no Supabase)
 * resolves null, so the UI degrades gracefully.
 */
export async function enqueueJob(paperId: string, figureLabel: string, target: JobTarget): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("extraction_jobs")
    .insert({ paper_id: paperId, figure_label: figureLabel, stage: "queued", target })
    .select("id")
    .single();
  if (error || !data) { if (error) console.error("enqueueJob:", error.message); return null; }
  return String(data.id);
}

// The live job stage — polled by the single-run page to show progress and to know when
// the worker has stored the result (stage === 'stored').
export interface JobStageInfo { stage: string; progress: number; error: string | null; }

export async function loadJobStage(jobId: string): Promise<JobStageInfo | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("stage, progress, error")
    .eq("id", jobId)
    .single();
  if (error || !data) { if (error) console.error("loadJobStage:", error.message); return null; }
  return { stage: String(data.stage), progress: Number(data.progress), error: (data.error as string | null) ?? null };
}

/** The newest extraction for a paper — how the single-run page picks up its result. */
export async function loadLatestExtraction(paperId: string): Promise<FigureExtraction | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("extractions")
    .select("*")
    .eq("paper_id", paperId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) {
    if (error) console.error("loadLatestExtraction:", error.message);
    return null;
  }
  return rowToExtraction(data[0]);
}

// A unified work item for the Papers surface: one (paper, figure) with a real,
// actionable status. Combines in-progress jobs (no extraction row yet) with
// extractions awaiting review — the things the human actually acts on.
export type WorkStatus = "extracting" | "needs_review" | "failed";
export interface WorkItem {
  key: string;
  paperTitle: string;
  figureLabel: string;
  status: WorkStatus;
  extractionId: string | null; // present once extracted → opens the verifier
  updatedAt: string;
}

export async function loadWorkItems(): Promise<WorkItem[]> {
  if (isPreview()) {
    return SAMPLE_ESCALATIONS.map((e) => ({
      key: `ext-${e.id}`,
      paperTitle: `${e.pathogen} · ${e.doi}`,
      figureLabel: e.figureLabel,
      status: "needs_review" as const,
      extractionId: e.id,
      updatedAt: "preview",
    }));
  }
  if (!supabase) return [];
  const items: WorkItem[] = [];

  // Extractions awaiting human review (the actionable set).
  const { data: exts, error: e1 } = await supabase
    .from("extractions")
    .select("id, figure_label, status, updated_at, papers(title)")
    .eq("status", "needs_human");
  if (e1) console.error("loadWorkItems(extractions):", e1.message);
  for (const r of (exts ?? []) as Record<string, unknown>[]) {
    items.push({
      key: `ext-${r.id}`,
      paperTitle: ((r.papers as { title?: string } | null)?.title) ?? "—",
      figureLabel: String(r.figure_label),
      status: "needs_review",
      extractionId: String(r.id),
      updatedAt: String(r.updated_at),
    });
  }

  // Jobs still in flight or failed (no extraction row to open yet).
  const { data: jobs, error: e2 } = await supabase
    .from("extraction_jobs")
    .select("id, figure_label, stage, updated_at, papers(title)")
    .not("stage", "in", "(stored)")
    .order("updated_at", { ascending: false });
  if (e2) console.error("loadWorkItems(jobs):", e2.message);
  for (const r of (jobs ?? []) as Record<string, unknown>[]) {
    const stage = String(r.stage);
    items.push({
      key: `job-${r.id}`,
      paperTitle: ((r.papers as { title?: string } | null)?.title) ?? "—",
      figureLabel: String(r.figure_label),
      status: stage === "failed" ? "failed" : "extracting",
      extractionId: null,
      updatedAt: String(r.updated_at),
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadEscalations(): Promise<FigureExtraction[]> {
  if (isPreview()) return SAMPLE_ESCALATIONS; // explicit preview mode → labeled sample data
  if (!supabase) return [];
  const { data, error } = await supabase.from("extractions").select("*").eq("status", "needs_human");
  if (error) { console.error("loadEscalations:", error.message); return []; }
  return (data ?? []).map(rowToExtraction);
}

export async function loadExtraction(id: string): Promise<FigureExtraction | null> {
  if (isPreview()) return SAMPLE_ESCALATIONS.find((e) => e.id === id) ?? null;
  if (!supabase) return null;
  const { data, error } = await supabase.from("extractions").select("*").eq("id", id).single();
  if (error || !data) { if (error) console.error("loadExtraction:", error.message); return null; }
  return rowToExtraction(data);
}

export async function loadLibrary(): Promise<FigureExtraction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("extractions").select("*").eq("status", "verified");
  if (error) { console.error("loadLibrary:", error.message); return []; }
  return (data ?? []).map(rowToExtraction);
}

export async function loadJobs(): Promise<Job[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("*, papers(title)")
    .order("updated_at", { ascending: false });
  if (error) { console.error("loadJobs:", error.message); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    paper: ((r.papers as { title?: string } | null)?.title) ?? "—",
    figure: String(r.figure_label),
    stage: r.stage as Job["stage"],
    progress: Number(r.progress),
    updatedAt: String(r.updated_at),
  }));
}

// Real throughput at the validation gates that have live data today: V5 (everything in
// `extractions` passed schema), V8 backlog (`needs_human`) and V8 pass (`verified`), plus
// failed jobs. The fetch/lineage/figure gates (V1–V4, V6, V7) aren't emitted yet — the
// chain visual marks those designed/conditional rather than faking a number.
export interface ValidationHealth {
  extracted: number;   // rows in `extractions` — all passed V5 (schema valid)
  needsHuman: number;  // status needs_human — the backlog before the human gate V8
  verified: number;    // status verified — passed V8
  failedJobs: number;  // extraction_jobs in stage 'failed'
}

export async function loadValidationHealth(): Promise<ValidationHealth> {
  const zero: ValidationHealth = { extracted: 0, needsHuman: 0, verified: 0, failedJobs: 0 };
  if (!supabase) return zero;
  const count = async (table: string, col?: string, val?: string): Promise<number> => {
    let q = supabase!.from(table).select("*", { count: "exact", head: true });
    if (col) q = q.eq(col, val);
    const { count: c, error } = await q;
    if (error) { console.error(`loadValidationHealth(${table}):`, error.message); return 0; }
    return c ?? 0;
  };
  const [extracted, needsHuman, verified, failedJobs] = await Promise.all([
    count("extractions"),
    count("extractions", "status", "needs_human"),
    count("extractions", "status", "verified"),
    count("extraction_jobs", "stage", "failed"),
  ]);
  return { extracted, needsHuman, verified, failedJobs };
}
