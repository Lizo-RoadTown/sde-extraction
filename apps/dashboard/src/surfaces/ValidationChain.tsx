import { useEffect, useState } from "react";
import { Card, Badge, cx } from "../ui";
import { loadValidationHealth, type ValidationHealth } from "../data";

// The V1–V8 validation chain, made visible. Every boundary where data crosses is a GATE
// that must pass before it advances (docs/superpowers/specs/2026-06-12-validation-points-map.md).
// This is the telemetry spine as a diagram: who checks, what's checked, and — where the
// data exists today — the real throughput. Gates not yet emitting telemetry are marked
// `designed` / `conditional`, never faked. v1 is a hand-rolled flow (no graph lib);
// React Flow is the upgrade path when it needs live edges + zoom.

type GateState = "live" | "partial" | "designed" | "conditional";

interface Gate {
  id: string;
  name: string;
  who: "machine" | "human";
  check: string;
  state: GateState;
  metric?: (h: ValidationHealth) => string | null;
}

const GATES: Gate[] = [
  { id: "V1", name: "DOI resolves", who: "machine", check: "Crossref returns a record", state: "designed" },
  { id: "V2", name: "Open licence", who: "machine", check: "Crossref license[] on allow-list", state: "designed" },
  { id: "V3", name: "Snapshot intact", who: "machine", check: "served_sha256 recorded · HTTP ok", state: "designed" },
  { id: "V4", name: "Text derived", who: "machine", check: "normalization → non-empty text", state: "designed" },
  { id: "V5", name: "Schema valid", who: "machine", check: "OpenAI structured output conforms", state: "live",
    metric: (h) => `${h.extracted} passed` },
  { id: "V6", name: "Lineage re-hashes", who: "machine", check: "each quote re-hashes to its sha", state: "partial" },
  { id: "V7", name: "Figure reproduced", who: "machine", check: "captured values regenerate the figure", state: "conditional" },
  { id: "V8", name: "Human verdict", who: "human", check: "present/absent confirmed vs source", state: "live",
    metric: (h) => `${h.needsHuman} waiting · ${h.verified} approved` },
];

const STATE_LABEL: Record<GateState, string> = {
  live: "live", partial: "partial", designed: "designed", conditional: "conditional",
};
const STATE_DOT: Record<GateState, string> = {
  live: "bg-present", partial: "bg-attention", designed: "bg-ink-faint", conditional: "bg-ink-faint",
};

export function ValidationChain() {
  const [health, setHealth] = useState<ValidationHealth>({ extracted: 0, needsHuman: 0, verified: 0, failedJobs: 0 });
  useEffect(() => { loadValidationHealth().then(setHealth); }, []);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Validation chain · V1–V8</span>
        <span className="text-[11px] text-ink-faint">
          {health.failedJobs > 0 ? `${health.failedJobs} failed job(s)` : "no failed jobs"}
        </span>
      </div>

      {/* the gates, in flow. wraps on small screens; arrows show the data advancing. */}
      <div className="flex flex-wrap items-stretch gap-x-1 gap-y-3">
        {GATES.map((g, i) => (
          <div key={g.id} className="flex items-stretch">
            <GateNode gate={g} metric={g.metric?.(health) ?? null} />
            {i < GATES.length - 1 && (
              <div className="flex items-center px-1 text-ink-faint" aria-hidden>→</div>
            )}
          </div>
        ))}
      </div>

      {/* the two human gates highlighted — the only points where a person decides */}
      <div className="rounded-md bg-inset px-3 py-2 text-[11px] text-ink-faint">
        Human is <span className="text-ink-dim">passive</span> through the machine gates (V1–V7) — observing and
        instrumenting, not gating — and <span className="text-ink-dim">active</span> at exactly two points:
        <span className="text-active"> intake</span> (ingestion type) and <span className="text-active"> V8</span> (the present/absent verdict).
      </div>

      {/* legend — honest status of each gate class */}
      <div className="flex flex-wrap gap-3 text-[11px] text-ink-faint">
        <Legend dot="bg-present" label="live — real data today" />
        <Legend dot="bg-attention" label="partial — exists, not fully wired" />
        <Legend dot="bg-ink-faint" label="designed / conditional — not yet emitting" />
      </div>
    </Card>
  );
}

function GateNode({ gate, metric }: { gate: Gate; metric: string | null }) {
  return (
    <div className={cx(
      "flex w-36 shrink-0 flex-col gap-1 rounded-md border px-2.5 py-2",
      gate.who === "human" ? "border-active-edge bg-active-soft/40" : "border-edge bg-surface-raised/40",
    )}>
      <div className="flex items-center justify-between">
        <span className="mono text-[11px] text-ink-dim">{gate.id}</span>
        <span className="flex items-center gap-1">
          <span className={cx("h-1.5 w-1.5 rounded-full", STATE_DOT[gate.state])} />
          <span className="text-[10px] text-ink-faint">{STATE_LABEL[gate.state]}</span>
        </span>
      </div>
      <div className="text-xs font-medium text-ink">{gate.name}</div>
      <div className="text-[10px] leading-tight text-ink-faint">{gate.check}</div>
      <div className="mt-0.5">
        {gate.who === "human"
          ? <Badge tone="cyan">human</Badge>
          : <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-ink-dim">machine</span>}
      </div>
      {metric && <div className="mono text-[10px] text-present">{metric}</div>}
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />{label}
    </span>
  );
}
