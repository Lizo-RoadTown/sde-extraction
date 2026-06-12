// Single data layer: query Supabase and return REAL backend state. No mock fallback —
// the dashboard shows what's actually in the database, including honest empty states.
// (If Supabase isn't configured, these return empty; the AuthGate prevents that on
// the deployed site by requiring login first.)

import { supabase } from "./lib/supabase";
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
  const m = (row.model ?? {}) as Partial<FigureExtraction>;
  return {
    id: String(row.id),
    paperTitle: m.paperTitle ?? (row.title as string) ?? "",
    pathogen: (row.pathogen as string) ?? m.pathogen ?? "",
    doi: (row.doi as string) ?? m.doi ?? "",
    figureLabel: (row.figure_label as string) ?? m.figureLabel ?? "",
    status: (row.status as FigureExtraction["status"]) ?? "needs_human",
    fileSha256: (row.file_sha256 as string) ?? m.fileSha256 ?? "",
    pdfUrl: m.pdfUrl ?? "#",
    stateVariables: m.stateVariables ?? [],
    parameters: m.parameters ?? [],
    driftTerms: m.driftTerms ?? [],
    diffusionTerms: m.diffusionTerms ?? [],
    figureBinding: m.figureBinding ?? { status: "absent", reason: "not_stated" },
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
 * (status defaults to 'queued'; target carries the Intake mode). Mock mode (no Supabase)
 * is a no-op that resolves false, so the UI degrades gracefully.
 */
export async function enqueueJob(paperId: string, figureLabel: string, target: JobTarget): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("extraction_jobs").insert({
    paper_id: paperId,
    figure_label: figureLabel,
    stage: "queued",
    target,
  });
  return !error;
}

export async function loadEscalations(): Promise<FigureExtraction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("extractions").select("*").eq("status", "needs_human");
  if (error) { console.error("loadEscalations:", error.message); return []; }
  return (data ?? []).map(rowToExtraction);
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
