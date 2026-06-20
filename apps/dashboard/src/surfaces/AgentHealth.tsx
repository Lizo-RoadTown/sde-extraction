import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge, cx } from "../ui";
import { loadAgentHealth, type AgentHealth as Vitals } from "../data";
import { activePath } from "../lib/supabase";

// Agent Health — the real stages of the pipeline and how healthy each is. The point is to show which
// steps are DETERMINISTIC (no LLM) and which is the one LLM step, plus the back-propagated human verdict
// that earns confidence by type. Only the LLM step's counts are real today (from the job queue); the
// rest show their honest status. (A Dagster workflow layer runs these same stages as observable steps,
// tested on a branch — it is NOT a separate app.)

type AgentState = "live" | "built" | "planned";
interface AgentDef {
  key: string;
  name: string;
  identity: string;       // the mechanism (model+version, or "deterministic")
  points: string;         // what it does in the pipeline
  state: AgentState;
  role: string;
}

// The real pipeline stages: detect (deterministic) -> extract (the one LLM step) -> reproduce
// (deterministic, built) -> store. Confining the LLM to ONE step is the whole design.
const AGENTS: AgentDef[] = [
  { key: "detect", name: "Figure detection", identity: "PyMuPDF · deterministic", points: "find figures + isolate the chosen panel", state: "live",
    role: "finds the figures and isolates the ONE the human picked — no LLM" },
  { key: "extractor", name: "Extractor", identity: "gpt-4o-2024-08-06 · the one LLM step", points: "reads the model behind the figure", state: "live",
    role: "the single LLM step: returns the figure-anchored present/absent model (structured output)" },
  { key: "reproduce", name: "Reproduction check", identity: "diffrax oracle · deterministic", points: "re-simulate twice, same-results verdict", state: "built",
    role: "runs the curation model twice at a fixed seed and compares — no LLM (built + tested; not yet in the live path)" },
  { key: "storage", name: "Storage", identity: "worker → Supabase", points: "store result, await the human verdict", state: "live",
    role: "writes the result + its telemetry; the human verdict feeds confidence back by type" },
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
  if (key === "detect") return [{ label: "status", value: "live · runs on every job (deterministic)", live: true }];
  if (key === "storage") return [{ label: "status", value: "live · writes every result (deterministic)", live: true }];
  if (key === "reproduce") return [{ label: "status", value: "built + tested · not yet in the live path", live: false }];
  return [{ label: "status", value: "planned — not yet operating", live: false }];
}

export function AgentHealth() {
  const [v, setV] = useState<Vitals>({ processed: 0, succeeded: 0, failed: 0, inFlight: 0, needsHuman: 0, verified: 0 });
  useEffect(() => { loadAgentHealth().then(setV); }, []);
  const path = activePath();
  const isDagster = path.schema === "dagster_app";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Each part of the pipeline and how healthy it is. Confidence is earned — the human verdict, tagged by kind, raises or lowers a part's trust.">
        Agent Health
      </SectionTitle>

      {/* Which path these vitals are for — each path runs over its own schema. On the Dagster path the
          stages run as an orchestrated, retriable Dagster job; on the direct path as a single call. */}
      <div className="rounded-md border border-edge bg-inset px-3 py-2 text-[11px] text-ink-dim">
        <span className="text-ink-faint">path </span>
        <span className="mono text-ink">{path.label}</span>
        <span className="text-ink-faint"> · {isDagster
          ? "Dagster orchestrates these stages as ordered, retriable, observable steps (a failed step retries on its own; the others' outputs are kept)"
          : "a single OpenAI/Pydantic call — the stages are not independently orchestrated or retriable"}</span>
      </div>

      <div className="flex flex-col gap-4">
        {AGENTS.map((a) => (
          <Card key={a.key} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{a.name}</span>
                  {a.state === "live" ? <Badge tone="green">live</Badge> : <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] text-ink-faint">{a.state}</span>}
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
        Honest status: the live pipeline is <span className="text-ink-dim">detect → extract → store</span>; only the
        <span className="text-ink-dim"> Extractor</span> is an LLM step, and only its counts are real (from the job
        queue). The <span className="text-ink-dim">reproduction check</span> (diffrax oracle) is built and tested but
        not yet in the live path. Drift, latency, and the back-propagated human verdict need telemetry
        (<span className="mono">validation_events</span> → loom) not emitted yet — marked, not faked. A Dagster
        workflow layer runs these same stages as observable steps (tested on a branch); it is not a separate app.
      </Card>
    </div>
  );
}
