import type { FigureExtraction, Job } from "./types";

// Mock data standing in for the engine + store, so the four surfaces are real to click through.
// Grounded in the Witbooi malaria paper (Figure 2) — including a deliberately ABSENT slot.

export const witbooiFig2: FigureExtraction = {
  id: "ext_witbooi_f2",
  paperTitle: "Stochastic modeling of a mosquito-borne disease",
  pathogen: "Malaria",
  doi: "10.1186/s13662-020-02803-w",
  figureLabel: "Figure 2",
  status: "needs_human",
  fileSha256: "9f2c…a41b",
  pdfUrl: "#",
  figureReproduced: null,
  stateVariables: [
    { symbol: "S", slot: { status: "present", value: "4900", meaning: "susceptible humans", quote: "S(0)=4900", page: 12, sha256: "c88f…ef0f" } },
    { symbol: "I", slot: { status: "present", value: "95", meaning: "infected humans", quote: "I(0)=95", page: 12, sha256: "1a2b…77cd" } },
    { symbol: "V", slot: { status: "present", value: "238800", meaning: "susceptible mosquitoes", quote: "V(0)=238800", page: 12, sha256: "44ee…9b1f" } },
  ],
  parameters: [
    { symbol: "mu", slot: { status: "present", value: "0.017/365", meaning: "natural human death rate", quote: "mu = 0.017/365", page: 11, sha256: "7ee7…675a" } },
    { symbol: "sigma", slot: { status: "present", value: "5E-6", meaning: "noise intensity (humans)", quote: "sigma = 5E-6", page: 12, sha256: "b3a9…1c20" } },
    { symbol: "kappa", slot: { status: "absent", reason: "requires_inference" } },
  ],
  driftTerms: [
    { variable: "S", slot: { status: "present", value: "A - a*b*S*J + h*R - mu*S", meaning: "dS drift", quote: "dS = (A - abSJ + hR - muS)dt", page: 12, sha256: "ee01…fa20" } },
  ],
  diffusionTerms: [
    { variable: "S", slot: { status: "present", value: "-sigma*S*I", meaning: "dS diffusion", quote: "- sigma S I dW", page: 12, sha256: "9c44…77aa" } },
  ],
  figureBinding: { status: "absent", reason: "not_stated" },
};

export const verifiedExample: FigureExtraction = {
  ...witbooiFig2,
  id: "ext_koufi_f42",
  paperTitle: "A stochastic SIRS epidemic model with Lévy jumps",
  pathogen: "Influenza",
  doi: "10.1016/j.aej.2022.01.328",
  figureLabel: "Figure 2",
  status: "verified",
  figureReproduced: true,
  figureBinding: { status: "present", value: "Table 1 + caption", meaning: "figure parameter set", quote: "parameters as in Table 1 with σ=0.05", page: 8, sha256: "aa12…0bce" },
};

export const library: FigureExtraction[] = [
  verifiedExample,
  { ...verifiedExample, id: "lib_dengue", paperTitle: "Dengue dynamics with Ornstein–Uhlenbeck process", pathogen: "Dengue", figureLabel: "Figure 3" },
  { ...verifiedExample, id: "lib_hbv", paperTitle: "Dynamics of a stochastic HBV model", pathogen: "Hepatitis B", figureLabel: "Figure 4" },
  { ...verifiedExample, id: "lib_cholera", paperTitle: "A stochastic cholera model with control", pathogen: "Cholera", figureLabel: "Figure 1" },
];

export const escalations: FigureExtraction[] = [witbooiF2Clone("ext_witbooi_f2"), witbooiF2Clone("ext_sars_f1", "SARS-CoV-2 environmental noise model", "SARS-CoV-2", "Figure 1")];

function witbooiF2Clone(id: string, title = witbooiFig2.paperTitle, pathogen = witbooiFig2.pathogen, fig = witbooiFig2.figureLabel): FigureExtraction {
  return { ...witbooiFig2, id, paperTitle: title, pathogen, figureLabel: fig };
}

export const jobs: Job[] = [
  { id: "job_1", paper: "Stochastic modeling of a mosquito-borne disease", figure: "Figure 2", stage: "human_verify", progress: 0.9, updatedAt: "2m ago" },
  { id: "job_2", paper: "SARS-CoV-2 environmental noise model", figure: "Figure 1", stage: "machine_verify", progress: 0.7, updatedAt: "just now" },
  { id: "job_3", paper: "A stochastic cholera model with control", figure: "Figure 1", stage: "extract", progress: 0.4, updatedAt: "1m ago" },
  { id: "job_4", paper: "Dengue dynamics with Ornstein–Uhlenbeck process", figure: "Figure 3", stage: "pdf_to_math", progress: 0.2, updatedAt: "3m ago" },
  { id: "job_5", paper: "Typhoid–pneumonia co-infection SDE", figure: "Figure 2", stage: "failed", progress: 0.5, updatedAt: "5m ago" },
];
