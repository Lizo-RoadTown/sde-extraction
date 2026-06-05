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
    }
  | { status: "absent"; reason: AbsenceReason };

export interface NamedSlot {
  symbol: string;
  slot: Slot;
}

export interface EquationSlot {
  variable: string;
  slot: Slot;
}

export type ExtractionStatus =
  | "queued"
  | "extracting"
  | "machine_verify"
  | "needs_human"
  | "verified"
  | "failed";

// One (paper, figure) pair — the unit of work.
export interface FigureExtraction {
  id: string;
  paperTitle: string;
  pathogen: string;
  doi: string;
  figureLabel: string;
  status: ExtractionStatus;
  fileSha256: string;
  pdfUrl: string;
  stateVariables: NamedSlot[];
  parameters: NamedSlot[];
  driftTerms: EquationSlot[];
  diffusionTerms: EquationSlot[];
  figureBinding: Slot; // "which values produced this figure?" — itself present/absent
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
