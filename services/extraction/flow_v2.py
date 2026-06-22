"""flow_v2 — the deterministic GATED flow that lifts the stochastic model matching a figure.

The design (Liz, 2026-06-20), built on the existing deterministic layer (schema.py / contracts.py /
assemble.py):

  STEP 1  The FIGURE is the anchor. read_figure produces a FigureRead whose `panels` ARE the variable
          checklist — the figure decides which variables exist. Everything below wraps back to it.
  STEP 2  Each STATE VARIABLE is followed by its own agent through a fixed sequence of GATES. At every
          gate the agent DETECTS (the one fuzzy part) and VALIDATES; the FLOW handles the result
          DETERMINISTICALLY. Parameters are grabbed per-variable (each variable is affected by its own
          parameters) and reconciled by a script (assemble.reconcile_params).
  STEP 3  Only after 1 & 2: the reconciled parameters + assembled model, the figure↔variable
          completeness crosscheck, then verify + store-it-all.

Principle: make it as deterministic as possible; the LLMs ARE the gates (detection) and the validators,
and that is where learning lives. The flow itself is fixed and checkable.

Build status: SCAFFOLD. The deterministic spine runs end-to-end today. The LLM gate/validator seams are
pluggable hooks (`AGENT`) that default to honest "not wired" stubs, to be filled gate by gate. No LLM
is imported here, so this is safe to import and test anywhere.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from assemble import absent_slot, assemble_model, crosscheck, reconcile_params
from contracts import SlotVerdict, StagedExtraction
from schema import FigureRead, Slot, VariableExtraction


# ---- the gates ---------------------------------------------------------------------------------
# A fixed, ordered sequence. Each gate is one transformation/decision point from the catalog
# (Agent Drafts/transformation-types-catalog.md). The sequence is DATA so gates are added/reordered
# without touching the runner. `family` ties the gate back to the catalog.

@dataclass(frozen=True)
class Gate:
    key: str
    title: str
    family: str          # catalog family: A figure-observable · B form · C notation · D params · E noise
    detail: str = ""


# Per-variable gates (each variable's agent walks these). `terms` is wired (its agent grabs the
# variable's drift/diffusion + its own parameters). The earlier provisional noise_structure/form/
# parameters stubs are removed: the model-level CLASSIFY stage (below, run_flow_v2) subsumes them
# properly — it identifies the formulation family + calculus convention + transformations against the
# classification registry, evidence-anchored, with the candidate-HITL track for new families.
GATES: list[Gate] = [
    Gate("terms", "Locate this variable's drift & diffusion terms for THIS figure", "B",
         "find the dX = (drift) dt + (diffusion) dW (+ this variable's params) for this figure's variable"),
]


# ---- the agent seam ----------------------------------------------------------------------------
# The LLM gates + validators plug in here. Two hooks per the design: DETECT (the variable's agent
# reads the paper at this gate) and VALIDATE (the same agent validates the gate's result). Defaults
# are honest stubs so the deterministic flow runs without an LLM; real agents are injected by the
# worker. Keeping them as callables (not imports) preserves "no LLM in this module".

DetectFn = Callable[[str, Gate, FigureRead, "VariableState"], dict[str, Any]]
ValidateFn = Callable[[str, Gate, "VariableState"], SlotVerdict]
ClassifyFn = Callable[[dict[str, Any], FigureRead], dict[str, Any]]


def _stub_detect(symbol: str, gate: Gate, figure_read: FigureRead, state: "VariableState") -> dict[str, Any]:
    """No agent wired yet: detect nothing, honestly."""
    return {"wired": False}


def _stub_validate(symbol: str, gate: Gate, state: "VariableState") -> SlotVerdict:
    return SlotVerdict(field_path=f"{symbol}:{gate.key}", verdict="uncertain", rationale="agent not wired")


def _stub_classify(model_dump: dict[str, Any], figure_read: FigureRead) -> dict[str, Any]:
    """No agent wired: don't guess a family."""
    return {"family_name": "unclassified", "family_is_new": False, "wired": False}


@dataclass
class Agent:
    """The per-variable agent (detect/validate, walks each variable through the gates) plus the
    model-level classify (identify the formulation family once the model is assembled)."""
    detect: DetectFn = _stub_detect
    validate: ValidateFn = _stub_validate
    classify: ClassifyFn = _stub_classify


AGENT = Agent()  # default (stubs). Replace AGENT.detect / AGENT.validate to wire real LLM gates.


# ---- per-variable state (what the agent carries through the gates) ------------------------------

@dataclass
class GateRecord:
    gate: str
    detection: dict[str, Any]
    verdict: str
    rationale: str = ""


@dataclass
class VariableState:
    """One variable being walked through the gates — its running result + an audit trail back to the
    figure. The fields mirror VariableExtraction; gates fill them. Absent until a gate provides one."""
    symbol: str
    figure_label: str                       # provenance: which figure this wraps back to
    meaning: Slot = field(default_factory=absent_slot)
    initial_value: Slot = field(default_factory=absent_slot)
    drift: Slot = field(default_factory=absent_slot)
    diffusion: Slot = field(default_factory=absent_slot)
    parameters: list = field(default_factory=list)
    gate_log: list[GateRecord] = field(default_factory=list)

    def to_extraction(self) -> VariableExtraction:
        return VariableExtraction(
            symbol=self.symbol, meaning=self.meaning, initial_value=self.initial_value,
            drift=self.drift, diffusion=self.diffusion, parameters=self.parameters,
        )


def walk_variable(symbol: str, figure_read: FigureRead, agent: Agent = AGENT) -> VariableState:
    """Run ONE variable through every gate: detect (agent) → record → validate (agent), in order.
    Deterministic control flow; the agent supplies the fuzzy detection/validation. Every record is
    anchored to the figure (figure_label)."""
    state = VariableState(symbol=symbol, figure_label=figure_read.figure_label)
    for gate in GATES:
        detection = agent.detect(symbol, gate, figure_read, state)
        verdict = agent.validate(symbol, gate, state)
        state.gate_log.append(GateRecord(gate=gate.key, detection=detection,
                                          verdict=verdict.verdict, rationale=verdict.rationale))
    return state


# ---- the flow ----------------------------------------------------------------------------------

def run_flow_v2(figure_read: FigureRead, agent: Agent = AGENT) -> dict[str, Any]:
    """The deterministic gated flow over one figure. Returns the assembled StagedExtraction plus the
    per-variable gate logs (the audit trail). The figure's `panels` are the variable checklist."""
    # STEP 2: one agent per checklist variable, each walking the gates.
    states = [walk_variable(sym, figure_read, agent) for sym in figure_read.panels if sym.strip()]
    ves = [s.to_extraction() for s in states]

    # STEP 3: deterministic assembly (existing scripts) — reconcile shared params, assemble, crosscheck.
    model = assemble_model(figure_read, ves)
    gaps, summary = crosscheck(figure_read.panels, model)

    # CLASSIFY (model-level): identify the formulation family against the registry — registry-matched,
    # evidence-anchored, candidate-HITL for new families. The classified result wraps back to the figure.
    classification = agent.classify(model.model_dump(), figure_read)

    staged = StagedExtraction(
        figure_read=figure_read,
        per_variable=ves,
        model=model,
        gaps=gaps,
        pipeline_version="v2",
    )
    return {
        "staged": staged,
        "crosscheck": summary,
        "classification": classification,
        "gate_log": {s.symbol: [r.__dict__ for r in s.gate_log] for s in states},
        "agent_wired": agent.detect is not _stub_detect,
    }


def run_from_pdf(
    *, pdf_url: Optional[str], figure_label: str,
    region: Optional[dict[str, Any]] = None, no_llm: bool = False, agent: Optional[Agent] = None,
) -> dict[str, Any]:
    """Entry point: GATE 0 reads the figure (LLM) → per-variable agents walk the gates → deterministic
    assembly. Lazy-imports agents_v2 so importing flow_v2 stays LLM-free. no_llm=True runs the whole
    spine on stubs (no spend). Pass `agent` to override (e.g. in tests)."""
    from agents_v2 import make_agent, read_figure  # lazy: keeps flow_v2 import clean of the LLM

    figure_read = read_figure(pdf_url=pdf_url, figure_label=figure_label, region=region, no_llm=no_llm)
    if agent is None:
        agent = make_agent(pdf_url=pdf_url, region=region, no_llm=no_llm)
    out = run_flow_v2(figure_read, agent)
    out["figure_read"] = figure_read
    out["figure_read_wired"] = bool(pdf_url) and not no_llm
    return out


# ---- Dagster engine wrapper (optional; imported lazily on the dagster path) ---------------------
# Dagster is the engine that walks the many options gate-by-gate. This wraps run_flow_v2 as an
# in-process job so each stage is observable/retriable. Kept lazy so the deterministic core above
# needs no dagster install.

def build_dagster_job():
    import dagster as dg

    @dg.op
    def flow_op(context, figure_read_json: str) -> dict:
        fr = FigureRead.model_validate_json(figure_read_json)
        out = run_flow_v2(fr)
        context.log.info(f"[flow_v2] variables={len(fr.panels)} complete={out['crosscheck'].get('complete')}")
        # StagedExtraction isn't trivially serializable as an op output here; return the audit summary.
        return {"crosscheck": out["crosscheck"], "gate_log": out["gate_log"], "agent_wired": out["agent_wired"]}

    @dg.job
    def figure_to_model_v2():
        flow_op()

    return figure_to_model_v2
