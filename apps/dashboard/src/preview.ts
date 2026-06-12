// PREVIEW-ONLY sample data. NOT used in production — surfaced only when preview mode is
// explicitly toggled on (see usePreview). Lets us SEE the filled UI before a real extraction
// has run. Modeled on the real Dengue OU completed review (DOI 10.1007/s00332-023-10004-4):
// 5 variables, 13 parameters, and x_bar as the canonical Absent(requires_inference) —
// "x_bar value not explicitly defined… never stated explicitly as a parameter definition."

import type { FigureExtraction, Slot } from "./types";

const present = (value: string, meaning: string, quote: string, page: number, sha?: string): Slot => ({
  status: "present", value, meaning, quote, page, sha256: sha,
});
const absent = (reason: "not_stated" | "requires_inference"): Slot => ({ status: "absent", reason });

export const SAMPLE_EXTRACTION: FigureExtraction = {
  id: "sample-dengue-ou",
  figureLabel: "Figure 1",
  figureType: "Stochastic realizations",
  outcome: "failed",
  pathogen: "Dengue (DENV-1 to DENV-4)",
  doi: "10.1007/s00332-023-10004-4",
  status: "needs_human",
  pdfUrl: "#",
  variables: [
    { symbol: "S", meaning: present("susceptible host cells", "the uninfected target cell population", "S(t) denotes susceptible cells", 3), initialValue: present("1000", "initial susceptible cells", "S(0)=1000, Section 6", 14) },
    { symbol: "I", meaning: present("infected host cells", "cells infected by the virus", "I(t) the infected cells", 3), initialValue: present("1000", "initial infected cells", "I(0)=1000, Section 6", 14) },
    { symbol: "V", meaning: present("free virus particles", "the viral load", "V(t) the free virus", 3), initialValue: present("1100", "initial virus", "V(0)=1100, Section 6", 14) },
    { symbol: "Z", meaning: present("immune response", "the immune effector cells", "Z(t) the immune response", 4), initialValue: present("1100", "initial immune cells", "Z(0)=1100, Section 6", 14) },
    { symbol: "x", meaning: present("the OU log-process", "x = ln(b), the Ornstein–Uhlenbeck driven parameter", "x = ln(b), eq. (1.3) p.5", 5), initialValue: present("2", "initial OU state", "x(0)=2, Section 6", 14) },
  ],
  parameters: [
    { symbol: "mu", value: present("0.0", "natural death rate", "μ in Table 2", 13), meaning: present("host cell death rate", "natural mortality of cells", "μ, Table 2", 13), units: absent("not_stated") },
    { symbol: "beta", value: present("6.417E-5", "infection rate", "β = 6.417×10⁻⁵, Table 2", 13), meaning: present("infection/transmission rate", "rate susceptible become infected", "β, Table 2", 13), units: absent("not_stated") },
    { symbol: "sigma", value: present("0.5", "noise intensity", "σ = 0.5, Table 2", 13), meaning: present("OU noise intensity", "the magnitude of the stochastic perturbation", "σ in the OU process, eq. (1.4)", 5), units: absent("not_stated") },
    { symbol: "x_bar", value: absent("requires_inference"), meaning: present("the OU mean-reversion level", "the long-run mean of x = ln(b)", "x̄ appears in eq. (1.4)", 5), units: absent("not_stated") },
  ],
  driftTerms: [
    { variable: "S", expression: present("Λ − μS − βSV", "susceptible dynamics", "dS = (Λ − μS − βSV)dt", 5) },
    { variable: "x", expression: present("θ(x̄ − x)", "OU mean-reversion drift", "dx = θ(x̄ − x)dt + σ dB", 5) },
  ],
  diffusionTerms: [
    { variable: "x", expression: present("σ", "OU noise term", "dx = θ(x̄ − x)dt + σ dB", 5) },
  ],
  timeSpan: {
    initialTime: present("0", "simulation start", "t₀ = 0, Section 6", 14),
    finalTime: absent("not_stated"),
  },
  figureReproduced: false,
};

export const SAMPLE_ESCALATIONS: FigureExtraction[] = [
  SAMPLE_EXTRACTION,
  { ...SAMPLE_EXTRACTION, id: "sample-2", figureLabel: "Figure 2", figureType: "Sensitivity sweep", pathogen: "SARS-CoV-2", doi: "10.1016/j.example.2022" },
];
