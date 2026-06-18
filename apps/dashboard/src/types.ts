// The data model the dashboard renders — mirrors the engine's Pydantic classifiers.
// Every captured fact is a Slot: forced present or absent (no fabricated middle).

export type AbsenceReason = "not_stated" | "requires_inference";

export type Slot =
  | {
      status: "present";
      value: string; // verbatim as written — never evaluated
      meaning: string; // meaning on everything
      quote: string; // exact source text (the model quoted; the engine hashed)
      page: number;
      sha256?: string; // lineage proof, attached by the engine
      rect?: { x: number; y: number; w: number; h: number }; // located position on the page (0..1), from the locator hook
      located?: boolean; // did the locator find the quote on the page? (verbatim verification)
    }
  | { status: "absent"; reason: AbsenceReason };

// The figure REQUIRES these — each carries its own present/absent slots + meaning.
// (symbol/variable is the anchor; meaning + value/initial-condition are searched.)
export interface Variable {
  symbol: string; // the anchor, e.g. "S"
  meaning: Slot; // what it represents (present/absent)
  initialValue: Slot; // its initial condition
}

export interface Parameter {
  symbol: string; // the anchor, e.g. "sigma"
  value: Slot; // its numeric value
  meaning: Slot; // what it represents
  units: Slot; // its units, if stated
}

export interface Term {
  variable: string; // which variable this change-term is for
  expression: Slot; // verbatim RHS, present/absent
}

export interface TimeSpan {
  initialTime: Slot;
  finalTime: Slot;
}

export type ExtractionStatus =
  | "queued"
  | "extracting"
  | "machine_verify"
  | "needs_human"
  | "verified"
  | "failed";

// One (paper, figure) extraction. The FIGURE is the anchor (NOT present/absent — it exists);
// the machinery it required to be produced is each present/absent.
export interface FigureExtraction {
  id: string;
  // --- the figure: the anchor ---
  figureLabel: string;
  figureType: string; // the classified outcome type (drives the backward search)
  outcome: string; // "successful" | "failed" — could it be reproduced?
  pathogen: string;
  doi: string;
  status: ExtractionStatus;
  pdfUrl: string;
  storagePath?: string; // the paper's storage path → signed PDF URL (the journey renders the real page)
  // The figure the worker ISOLATED (server-side PyMuPDF) — page + normalized bbox, so the UI can
  // render the actual figure crop from the PDF (the "paper" side of the figure-compare oracle).
  figureProvenance?: {
    page: number;
    bboxNorm: [number, number, number, number];
    label?: string;
    caption?: string;
  };
  // --- what the figure required: each present/absent, with meaning ---
  variables: Variable[];
  parameters: Parameter[];
  driftTerms: Term[];
  diffusionTerms: Term[];
  timeSpan: TimeSpan;
  figureReproduced?: boolean | null; // the oracle: did captured values regenerate the figure?
}

export type PipelineStage =
  | "ingest"
  | "pdf_to_math"
  | "extract"
  | "machine_verify"
  | "human_verify"
  | "stored"
  | "failed";

export interface Job {
  id: string;
  paper: string;
  figure: string;
  stage: PipelineStage;
  progress: number; // 0..1
  updatedAt: string;
}
