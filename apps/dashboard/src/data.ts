// Single data layer: query Supabase when configured, else fall back to mock data.
// Surfaces import from here, so going live = setting env vars (no component changes).

import { supabase } from "./lib/supabase";
import * as mock from "./mock";
import type { FigureExtraction, Job } from "./types";

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

export async function loadEscalations(): Promise<FigureExtraction[]> {
  if (!supabase) return mock.escalations;
  const { data, error } = await supabase.from("extractions").select("*").eq("status", "needs_human");
  if (error || !data?.length) return mock.escalations;
  return data.map(rowToExtraction);
}

export async function loadLibrary(): Promise<FigureExtraction[]> {
  if (!supabase) return mock.library;
  const { data, error } = await supabase.from("extractions").select("*").eq("status", "verified");
  if (error || !data?.length) return mock.library;
  return data.map(rowToExtraction);
}

export async function loadJobs(): Promise<Job[]> {
  if (!supabase) return mock.jobs;
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("*, papers(title)")
    .order("updated_at", { ascending: false });
  if (error || !data?.length) return mock.jobs;
  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    paper: ((r.papers as { title?: string } | null)?.title) ?? "—",
    figure: String(r.figure_label),
    stage: r.stage as Job["stage"],
    progress: Number(r.progress),
    updatedAt: String(r.updated_at),
  }));
}
