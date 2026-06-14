// Single data layer: query Supabase and return REAL backend state. No mock fallback —
// the dashboard shows what's actually in the database, including honest empty states.
// (If Supabase isn't configured, these return empty; the AuthGate prevents that on
// the deployed site by requiring login first.)

import { supabase } from "./lib/supabase";
import { isPreview } from "./usePreview";
import { SAMPLE_ESCALATIONS } from "./preview";
import type { FigureExtraction, Job, Slot, Variable, Parameter, Term } from "./types";

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

// Map a stored extraction row to the dashboard shape. The worker writes the Pydantic
// model_dump() — SNAKE_CASE (figure_type, drift_terms, initial_value, time_span) — while the
// preview sample uses camelCase. This reads BOTH (snake first, camel fallback) so real
// extractions render fully; the slot interiors (value/meaning/quote/page/reason) already match.
function rowToExtraction(row: Record<string, unknown>): FigureExtraction {
  const m = (row.model ?? {}) as Record<string, unknown>;
  const absent: Slot = { status: "absent", reason: "not_stated" };
  const pick = <T,>(o: Record<string, unknown>, a: string, b: string, d: T): T =>
    (o[a] as T) ?? (o[b] as T) ?? d;

  const variables: Variable[] = ((m.variables as Record<string, unknown>[]) ?? []).map((v) => ({
    symbol: String(v.symbol ?? ""),
    meaning: (v.meaning as Slot) ?? absent,
    initialValue: pick<Slot>(v, "initial_value", "initialValue", absent),
  }));
  const parameters: Parameter[] = ((m.parameters as Record<string, unknown>[]) ?? []).map((p) => ({
    symbol: String(p.symbol ?? ""),
    value: (p.value as Slot) ?? absent,
    meaning: (p.meaning as Slot) ?? absent,
    units: (p.units as Slot) ?? absent,
  }));
  const mapTerms = (arr: unknown): Term[] =>
    ((arr as Record<string, unknown>[]) ?? []).map((t) => ({
      variable: String(t.variable ?? ""),
      expression: (t.expression as Slot) ?? absent,
    }));
  const ts = (m.time_span ?? m.timeSpan ?? {}) as Record<string, unknown>;

  return {
    id: String(row.id),
    // The figure is the anchor: prefer the real figure the model identified over the
    // '(auto)' intake placeholder still sitting in the column on older rows.
    figureLabel: (() => {
      const col = (row.figure_label as string | undefined)?.trim();
      const fromModel = pick<string>(m, "figure_label", "figureLabel", "");
      return col && col !== "(auto)" ? col : (fromModel || col || "");
    })(),
    figureType: pick<string>(m, "figure_type", "figureType", ""),
    outcome: (m.outcome as string) ?? "",
    pathogen: (row.pathogen as string) ?? (m.pathogen as string) ?? "",
    doi: (row.doi as string) ?? (m.doi as string) ?? "",
    status: (row.status as FigureExtraction["status"]) ?? "needs_human",
    pdfUrl: (m.pdfUrl as string) ?? "#",
    storagePath: (row.papers as { storage_path?: string } | null)?.storage_path
      ?? (row.storage_path as string | undefined),
    variables,
    parameters,
    driftTerms: mapTerms(m.drift_terms ?? m.driftTerms),
    diffusionTerms: mapTerms(m.diffusion_terms ?? m.diffusionTerms),
    timeSpan: {
      initialTime: pick<Slot>(ts, "initial_time", "initialTime", absent),
      finalTime: pick<Slot>(ts, "final_time", "finalTime", absent),
    },
    figureReproduced: (row.figure_reproduced as boolean | null) ?? null,
  };
}

// The Intake targeting choice that rides on a queued job (the worker's processor
// branches on target.mode — services/extraction/processor.py).
export interface JobTarget {
  mode: "auto" | "figure" | "model" | "whole";
  figure_ref?: string;
  model_desc?: string;
  lane?: "walkthrough" | "bulk"; // which audience lane enqueued it (the worker copies it to the extraction)
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
    .select("*, papers(storage_path)")
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

  // Bulk shows only bulk-lane work — Walkthrough papers are handled inline on the front
  // page and must not clutter here (lane separation, migration 0004). NULL lane = legacy → shown.
  const isWalkthrough = (lane: unknown) => lane === "walkthrough";

  // Extractions awaiting human review (the actionable set).
  const { data: exts, error: e1 } = await supabase
    .from("extractions")
    .select("id, figure_label, status, updated_at, lane, papers(title)")
    .eq("status", "needs_human");
  if (e1) console.error("loadWorkItems(extractions):", e1.message);
  for (const r of (exts ?? []) as Record<string, unknown>[]) {
    if (isWalkthrough(r.lane)) continue;
    items.push({
      key: `ext-${r.id}`,
      paperTitle: ((r.papers as { title?: string } | null)?.title) ?? "—",
      figureLabel: String(r.figure_label),
      status: "needs_review",
      extractionId: String(r.id),
      updatedAt: String(r.updated_at),
    });
  }

  // Jobs still in flight or failed (no extraction row to open yet). Lane lives in target.
  const { data: jobs, error: e2 } = await supabase
    .from("extraction_jobs")
    .select("id, figure_label, stage, updated_at, target, papers(title)")
    .not("stage", "in", "(stored)")
    .order("updated_at", { ascending: false });
  if (e2) console.error("loadWorkItems(jobs):", e2.message);
  for (const r of (jobs ?? []) as Record<string, unknown>[]) {
    if (isWalkthrough((r.target as { lane?: string } | null)?.lane)) continue;
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
  const { data, error } = await supabase.from("extractions").select("*, papers(storage_path)").eq("status", "needs_human");
  if (error) { console.error("loadEscalations:", error.message); return []; }
  return (data ?? []).map(rowToExtraction);
}

export async function loadExtraction(id: string): Promise<FigureExtraction | null> {
  if (isPreview()) return SAMPLE_ESCALATIONS.find((e) => e.id === id) ?? null;
  if (!supabase) return null;
  const { data, error } = await supabase.from("extractions").select("*, papers(storage_path)").eq("id", id).single();
  if (error || !data) { if (error) console.error("loadExtraction:", error.message); return null; }
  return rowToExtraction(data);
}

// The human gate (V8): record the reviewer's verdict and move the extraction. Approve →
// 'verified' (leaves the queue, enters the Library); send back → 'failed' (human-rejected).
// Logged in review_decisions either way. (RLS: "authed full access" — a signed-in user may write.)
export async function submitVerdict(
  extractionId: string,
  decision: "approve" | "send_back",
  reason?: string,
): Promise<boolean> {
  if (!supabase) return false;
  const status = decision === "approve" ? "verified" : "failed";
  const { error } = await supabase.from("extractions").update({ status }).eq("id", extractionId);
  if (error) { console.error("submitVerdict(status):", error.message); return false; }
  const { error: e2 } = await supabase
    .from("review_decisions")
    .insert({ extraction_id: extractionId, reviewer: "Liz", decision, reason: reason ?? null });
  if (e2) console.error("submitVerdict(log):", e2.message); // logging is best-effort; the move already happened
  return true;
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

// Real operational vitals for the ONE agent that runs today — the Extractor (the worker's
// OpenAI call at V5). Derived from the job queue + extraction statuses. The orchestration's
// other roles (Orchestrator / Validator / Storage) aren't built, so the Agent Health page
// marks them planned rather than inventing numbers.
export interface AgentHealth {
  processed: number;  // jobs the extractor finished (stored + failed)
  succeeded: number;  // jobs stored
  failed: number;     // jobs failed
  inFlight: number;   // queued / ingest / extract / machine_verify
  needsHuman: number; // its output awaiting the human gate (V8 backlog)
  verified: number;   // its output that passed V8 (downstream outcome — once verdicts are wired)
}

// Per-SEAM telemetry — the observability spine made real. Aggregates validation_events by
// `point` (the seam) so Extraction Health can render each data-transfer point with its live
// counts/outcome/latency. Empty until the worker has emitted events; the UI shows that honestly.
export interface SeamStat {
  point: string;
  count: number;
  pass: number;
  flag: number;
  fail: number;
  avgLatencyMs: number | null;
  lastTags: Record<string, unknown> | null;
  byLane: Record<string, number>;    // intake decomposition — how many crossed per lane
  bySource: Record<string, number>;  // …and per origin (upload / doi / …)
}

export async function loadSeamTelemetry(): Promise<Record<string, SeamStat>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("validation_events")
    .select("point, outcome, latency_ms, tags, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) { console.error("loadSeamTelemetry:", error.message); return {}; }
  const acc: Record<string, SeamStat & { _lat: number[] }> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const p = String(r.point);
    const s = (acc[p] ??= { point: p, count: 0, pass: 0, flag: 0, fail: 0, avgLatencyMs: null, lastTags: null, byLane: {}, bySource: {}, _lat: [] });
    s.count++;
    const o = String(r.outcome);
    if (o === "pass") s.pass++; else if (o === "flag") s.flag++; else if (o === "fail") s.fail++;
    if (typeof r.latency_ms === "number") s._lat.push(r.latency_ms);
    if (s.lastTags === null && r.tags) s.lastTags = r.tags as Record<string, unknown>; // newest first → first seen is latest
    const tg = (r.tags ?? {}) as Record<string, unknown>;
    if (typeof tg.lane === "string") s.byLane[tg.lane] = (s.byLane[tg.lane] ?? 0) + 1;
    if (typeof tg.source === "string") s.bySource[tg.source] = (s.bySource[tg.source] ?? 0) + 1;
  }
  const out: Record<string, SeamStat> = {};
  for (const [p, s] of Object.entries(acc)) {
    out[p] = { point: s.point, count: s.count, pass: s.pass, flag: s.flag, fail: s.fail,
      avgLatencyMs: s._lat.length ? Math.round(s._lat.reduce((a, b) => a + b, 0) / s._lat.length) : null,
      lastTags: s.lastTags, byLane: s.byLane, bySource: s.bySource };
  }
  return out;
}

export async function loadAgentHealth(): Promise<AgentHealth> {
  const zero: AgentHealth = { processed: 0, succeeded: 0, failed: 0, inFlight: 0, needsHuman: 0, verified: 0 };
  if (!supabase) return zero;
  const { data: jobs, error } = await supabase.from("extraction_jobs").select("stage");
  if (error) { console.error("loadAgentHealth(jobs):", error.message); return zero; }
  const tally: Record<string, number> = {};
  for (const r of (jobs ?? []) as { stage: string }[]) tally[r.stage] = (tally[r.stage] ?? 0) + 1;
  const succeeded = tally["stored"] ?? 0;
  const failed = tally["failed"] ?? 0;
  const total = (jobs ?? []).length;
  const inFlight = total - succeeded - failed;

  const statusCount = async (s: string): Promise<number> => {
    const { count, error: e } = await supabase!.from("extractions").select("*", { count: "exact", head: true }).eq("status", s);
    if (e) { console.error("loadAgentHealth(status):", e.message); return 0; }
    return count ?? 0;
  };
  const [needsHuman, verified] = await Promise.all([statusCount("needs_human"), statusCount("verified")]);
  return { processed: succeeded + failed, succeeded, failed, inFlight, needsHuman, verified };
}
