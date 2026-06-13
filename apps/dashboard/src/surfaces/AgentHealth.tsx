import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import { loadAgentHealth, type AgentHealth as Vitals } from "../data";

// Agent Health — the AGENT side of the telemetry we mapped (validation-points-map.md §Agent
// health): for each agent operating a gate, its identity, success rate AT that point, drift,
// latency/error, and the back-propagated downstream V8 outcome (the truest health signal, and
// exactly what the confidence pillar consumes). Today only the Extractor runs, so it gets real
// vitals from the job queue; the orchestration's other roles are marked planned, not faked.

type AgentState = "live" | "planned";
interface AgentDef {
  key: string;
  name: string;
  identity: string;       // model+version, or the mechanism
  points: string;         // the validation point(s) it operates
  state: AgentState;
  role: string;
}

// The four roles from the deepagents orchestration (Orchestrator → Extractor → Validator →
// Storage). Only the Extractor is wired today.
const AGENTS: AgentDef[] = [
  { key: "orchestrator", name: "Orchestrator", identity: "deepagents (planned)", points: "intake → storage", state: "planned",
    role: "routes a job through the pipeline and spawns the sub-agents" },
  { key: "extractor", name: "Extractor", identity: "gpt-4o-2024-08-06", points: "V5 · schema-valid present/absent", state: "live",
    role: "reads the PDF and returns the figure-anchored model (structured output)" },
  { key: "validator", name: "Validator", identity: "2nd model + scripts (planned)", points: "V3–V7 · lineage + two-model agreement", state: "planned",
    role: "re-hashes lineage and cross-checks the extraction before it reaches the human" },
  { key: "storage", name: "Storage", identity: "writer (planned)", points: "staging → final on approve", state: "planned",
    role: "writes the result + lineage to staging, promotes to final after the human verdict" },
];

// The telemetry layers we mapped, per agent. Real for the extractor; the rest await wiring.
function layersFor(key: string, v: Vitals): { label: string; value: string; live: boolean }[] {
  if (key === "extractor") {
    const rate = v.succeeded + v.failed > 0 ? Math.round((v.succeeded / (v.succeeded + v.failed)) * 100) : null;
    return [
      { label: "jobs processed", value: String(v.processed), live: true },
      { label: "succeeded / failed", value: `${v.succeeded} / ${v.failed}`, live: true },
      { label: "success rate @ V5", value: rate === null ? "—" : `${rate}%`, live: rate !== null },
      { label: "in flight", value: String(v.inFlight), live: true },
      { label: "awaiting human (V8)", value: String(v.needsHuman), live: true },
      { label: "downstream V8 pass", value: `${v.verified} verified`, live: v.verified > 0 },
      { label: "drift over versions", value: "not yet instrumented", live: false },
      { label: "latency · error/refusal", value: "not yet instrumented", live: false },
    ];
  }
  return [{ label: "status", value: "planned — not yet operating", live: false }];
}

export function AgentHealth() {
  const [v, setV] = useState<Vitals>({ processed: 0, succeeded: 0, failed: 0, inFlight: 0, needsHuman: 0, verified: 0 });
  useEffect(() => { loadAgentHealth().then(setV); }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Each agent that operates a validation gate, and how healthy it is. Agent health is how confidence is earned — the back-propagated human verdict (V8), tagged by model/figure type, raises or lowers an extractor's trust.">
        Agent Health
      </SectionTitle>

      <div className="flex flex-col gap-4">
        {AGENTS.map((a) => (
          <Card key={a.key} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{a.name}</span>
                  {a.state === "live" ? <Badge tone="green">live</Badge> : <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] text-ink-faint">planned</span>}
                </div>
                <div className="text-[11px] text-ink-faint">{a.role}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="mono text-[11px] text-ink-dim">{a.identity}</div>
                <div className="text-[11px] text-ink-faint">{a.points}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-4">
              {layersFor(a.key, v).map((l) => (
                <div key={l.label} className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-ink-faint">{l.label}</span>
                  <span className={cx("mono text-sm", l.live ? "text-ink" : "text-ink-faint")}>{l.value}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="text-[11px] text-ink-faint">
        Honest status: only the <span className="text-ink-dim">Extractor</span> runs today, so only its counts are real
        (derived from the job queue). Drift, latency, and the back-propagated V8 outcome need the telemetry events
        (<span className="mono">validation_events</span> → loom) that aren’t emitted yet — marked, not faked. The other
        three roles arrive with the deepagents orchestration (Orchestrator / Validator / Storage + staging).
      </Card>
    </div>
  );
}
