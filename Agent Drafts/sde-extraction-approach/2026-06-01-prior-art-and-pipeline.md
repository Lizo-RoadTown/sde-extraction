---
title: SDE_Extraction — Prior-Art Landscape and Recommended Pipeline
status: AGENT DRAFT — awaiting human validation
generated_by: multi-agent research workflow (loom-discipline + deep-research-pattern)
workflow_run: wf_cec6c81c-9f9
agents: 20 (7 survey, 12 verify, 1 synthesis)
web_tool_calls: 269
date: 2026-06-01
human_input: >
  Research question and scope set by Liz — "best approach for automating extraction of SDE
  epidemiological models from academic literature using OpenAI + Pydantic, and whether anything
  like this already exists." Strands and verification design authored by the dev agent on her
  direction. See conversation transcript for the question-and-answer that shaped this.
validated_by: (pending — Liz)
validation_notes: (none yet)
---

# SDE_Extraction — Prior-Art Landscape and Recommended Pipeline

> **Provenance:** This is an unreviewed agent draft. Every "verified" claim below passed an
> adversarial verification pass (a separate agent visited the URL and tried to refute the claim);
> "unverified" items are flagged explicitly and must be confirmed before they are relied on.

## TL;DR

The **deterministic-ODE version of this exact system already exists and is verified real** — DARPA's
**ASKEM** program (MIRA + SKEMA + Terarium + the AMR schemas). But:

1. **None of it represents stochastic (SDE) structure** — every epi-model representation surveyed is
   ODE / Petri-net / mass-action. No drift/diffusion/Wiener terms anywhere. AMR's `distribution`
   object is *parameter uncertainty*, not stochastic *dynamics*.
2. **None does the LLM-paper-to-Pydantic extraction step** — in ASKEM that step was separate tooling,
   and it predates OpenAI structured outputs.
3. **The maintained repos were archived read-only ~2025-04-07** (program wind-down).

So the gap this project fills — *stochastic* models, via OpenAI structured outputs into validated
Pydantic schemas, with a human-in-the-loop queue — is genuine. Adopt nothing wholesale; **adapt** the
AMR schema (extending it for SDE) and **reference** the rest.

## 1. The landscape (verified)

| System | What it is | Real? | For us |
|---|---|---|---|
| **DARPA ASKEM** | Umbrella program: automate extracting models from papers (~$29.4M, 42 mo) | yes (archived ~Apr 2025) | adapt schemas, reference architecture |
| **MIRA** — github.com/gyorilab/mira | Python; epi models as **Pydantic** `TemplateModel`s; → AMR/Petri/SBML | yes, active (v0.10.1) | reference (Pydantic schema design) |
| **Terarium** — github.com/DARPA-ASKEM/terarium | Upload paper → extract model → HITL workbench | yes (archived) | reference (closest end-to-end + HITL) |
| **SKEMA** — github.com/ml4ai/skema | Equation extraction; `img2mml` (equation image → MathML) | yes, dormant (v1.12.0, May 2024) | reference / reuse `img2mml` |
| **AMR schemas** — github.com/DARPA-ASKEM/Model-Representations | JSON-Schema for epi models (petrinet/regnet/stockflow) | yes (archived) | **adapt** → Pydantic target, extend for SDE |
| BioModels (EMBL-EBI) | SBML/ODE systems-biology repo + manual curation | yes | reference (curation discipline; thin fixture source) |
| EpiRecipes / sir-julia | Model catalog incl. 3 explicit SDE-SIR formulations | yes | reference / eval-data seed |
| AlgebraicJulia, EpiGraphHub, PyMC, INDRA/EMMAA | Adjacent (composition, data BI, inference, bio-NLP) | yes | out of scope / reference only |

**Load-bearing finding:** verified across MIRA, AMR, SKEMA, Terarium, AlgebraicJulia — **no existing
epi representation natively encodes SDE drift + diffusion + noise terms.** Adopting AMR/MIRA as-is
would silently drop the stochastic structure. The SDE schema extension is original work.

## 2. Recommended end-to-end pipeline

1. **PDF → LaTeX/MathML.** Per benchmark arXiv:2512.09874 — a vision-language model (Qwen3-VL /
   Gemini) or **Marker** as front-end; **Mathpix** as a paid high-accuracy oracle; **GROBID** for
   document structure. Avoid Nougat (non-commercial weights, unmaintained). ⚠️ benchmark is
   *synthetic* — re-validate on real epidemiology PDFs.
2. **LaTeX/text → Pydantic SDE object.** OpenAI **Structured Outputs** for shape + **Instructor**
   (github.com/567-labs/instructor) for the validate-and-retry loop (Pydantic-native; re-asks with the
   error on failure). Encode SDE domain rules as `field_validator`s.
3. **Semantic correctness** (what schema-validity cannot give you). Symbolic re-derivation with
   **SymPy**; **metamorphic tests** (scale population → compartments scale; β=0 → susceptibles frozen;
   S+I+R=N conserved); property testing with **Hypothesis**. ⚠️ the strongest methods (SymCode
   arXiv:2510.25975, MATH-VF arXiv:2505.20869) are *papers, not libraries* — reimplement.
4. **Human-in-the-loop queue** (non-optional). **LangExtract** (github.com/google/langextract) for
   character-level source grounding + HTML review viewer; pair with **Mathpix-Markdown** to render
   LaTeX back to visual math for sign-off. Model the workflow on Terarium + BioModels'
   "reproduce-the-figure" discipline — i.e., the AT3_review queue.

## 3. Build vs borrow

| Concern | Borrow (verified) | Build ourselves |
|---|---|---|
| PDF → math | VLM / Marker / Mathpix / GROBID | re-validation harness on real SDE papers |
| Extraction loop | OpenAI Structured Outputs + Instructor | the SDE Pydantic schema + domain validators |
| Model schema | adapt AMR JSON Schema → Pydantic; reference MIRA `TemplateModel` | **SDE extensions: drift/diffusion/Wiener terms** |
| Semantic validation | Hypothesis, SymPy, Guardrails AI | epi-specific metamorphic relations + symbolic re-derivation harness |
| HITL review UI | LangExtract + Mathpix-Markdown | the verification queue workflow (≈ AT3_review) |
| Eval / gold set | sir-julia SDE examples; filtered BioModels pairs | broader real-paper SDE gold set + accuracy metrics |
| Orchestration | reference ASKEM knowledge-middleware's 7-function decomposition | own Python orchestration (don't run the archived middleware) |

## 4. `FormulationFamily` typology (⚠️ citations UNVERIFIED — confirm before enum lock)

The standard reference is **Linda Allen's** stochastic-epidemic taxonomy. The agents verified the
*gap* (no tool represents SDEs) but did **not** verify citations per family this pass. The SDE-relevant
families (how the noise enters):

- **Diffusion approximation / Chemical Langevin** — drift = the ODE; diffusion from event-rate
  covariance (the formal CTMC → SDE limit).
- **Environmental / parametric noise** — fluctuating rates, often multiplicative noise on β
  (the SARS example in AT3_review).
- **Demographic noise** — from discrete birth/death/transition events; scales ~1/√N.
- **Ornstein–Uhlenbeck parameter process** — a parameter mean-reverts stochastically
  (the Dengue example in AT3_review).
- plus an **Itô vs Stratonovich** axis to record separately.

> Before locking the enum: fetch and verify Allen, *An Introduction to Stochastic Epidemic Models*,
> and Allen (2017), *Infectious Disease Modelling*, plus the chemical-Langevin / diffusion-approximation
> primary sources; attach one verified citation per enum member.

## 5. Key risks & open questions

1. **The SDE schema gap is real and ours to design** — AMR-as-is drops stochastic structure silently.
2. **Equation-to-code correctness is the hardest, least-solved part** — schema-conformance guarantees
   *shape, not meaning*; a sign error or dropped diffusion term passes schema validation and still
   runs. The defenses (SymCode, MATH-VF) are research papers, not packages.
3. **Evaluation is genuinely hard** — the PDF-math benchmark is synthetic + LLM-judged; exact-match F1
   understates true accuracy (NERRE, *Nature Communications* 2024); raw LLM field agreement ~62–72%
   (AIDE, arXiv:2501.11840); **LLMs catch real scientific errors at <21% recall** (SPOT,
   arXiv:2505.11855) → automated checks flag, humans adjudicate. No SDE-epi-specific benchmark exists.
4. **Archived dependencies** — the ASKEM stack is frozen; fork/vendor the AMR schema, expect no fixes.
5. **Licensing landmines (if productized)** — Nougat weights CC-BY-NC; Marker dual GPL-3.0 +
   AI2-OpenRAIL (commercial threshold); Mathpix paid + data leaves environment; pix2tex (MIT) and
   GROBID (Apache-2.0) are clean.

### Do NOT assert these exist (unverified this pass)
- "PyRenew" / a named CDC PyMC epidemiology module
- MATH-VF's specific "SymPy/Z3" tool naming (inferred from abstract)
- the AlgebraicJulia ↔ MIRA `pyacsets` exchange linkage (only partially verified)
- the §4 `FormulationFamily` canonical citations
- whether SKEMA itself uses any LLM (its documented extractors are rule-based + `img2mml`)

## Sources (verified, primary)

- DARPA ASKEM — https://www.darpa.mil/research/programs/automating-scientific-knowledge-extraction-modeling
- MIRA — https://github.com/gyorilab/mira · https://miramodel.readthedocs.io/
- Terarium — https://github.com/DARPA-ASKEM/terarium
- SKEMA — https://github.com/ml4ai/skema
- AMR schemas — https://github.com/DARPA-ASKEM/Model-Representations
- BioModels — https://www.ebi.ac.uk/biomodels/
- EpiRecipes / sir-julia — https://github.com/epirecipes/sir-julia
- Instructor — https://github.com/567-labs/instructor
- LangExtract — https://github.com/google/langextract
- OpenAI Structured Outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- Hypothesis — https://hypothesis.readthedocs.io/
- PDF-math benchmark — https://arxiv.org/abs/2512.09874
- NERRE — https://www.nature.com/articles/s41467-024-45563-x
- SPOT (HITL justification) — https://arxiv.org/abs/2505.11855
