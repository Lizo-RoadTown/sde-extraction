import { useEffect, useState, type CSSProperties } from "react";
import { Card, Badge, cx } from "../ui";
import { loadSeamTelemetry, loadValidationHealth, type SeamStat, type ValidationHealth } from "../data";

// Observability as a NEARLY-DECOMPOSABLE map (docs/architecture/2026-06-13-nearly-decomposable-observability.md):
// data rests in DRAWERS (subsystems, in a form) and moves across SEAMS (interfaces). We watch at the
// seams, with telemetry richness ∝ coupling: a MOVE (1→1) gets a thin pipe; a TRANSFORM/FAN-OUT
// (1→many, new form — the PDF→slots burst) gets the rich telemetry and is drawn as a burst.
// Reads real validation_events (via loadSeamTelemetry); honest "no telemetry yet" where none.

type Coupling = "move" | "fanout" | "enrich" | "merge" | "check" | "audit" | "gate";

interface SeamDef {
  id: string;
  name: string;
  coupling: Coupling;
  from: string;   // drawer above
  to: string;     // drawer below
  point?: string; // validation_events.point key (real telemetry) if emitted
  planned?: boolean;
  note: string;
}

// Top → bottom: intake converges at the queue, then the pipeline descends to the Library.
const SEAMS: SeamDef[] = [
  { id: "S1", name: "store PDF", coupling: "move", from: "Source · uploaded PDF", to: "File store", note: "bytes → papers (file_sha256). Same form, drawer→drawer." },
  { id: "S1b", name: "fetch snapshot", coupling: "move", from: "Source · DOI", to: "File store", planned: true, note: "publisher → retained snapshot (V1–V4). Planned — a second intake origin." },
  { id: "S2", name: "enqueue", coupling: "move", from: "File store", to: "Job queue", note: "intake choice → a command (target: lane/mode/figure). All intakes converge here." },
  { id: "S3", name: "extract", coupling: "fanout", from: "Job queue", to: "Extractor (LLM)", point: "extract", note: "ONE PDF → many present/absent slots, a NEW form. The richest seam." },
  { id: "S4", name: "locate", coupling: "enrich", from: "Extractor (LLM)", to: "Located slots", point: "locate", note: "each quote pinned on the PDF + verbatim-verified (confidence tiers)." },
  { id: "S5", name: "reconcile", coupling: "merge", from: "Located slots", to: "Assembled model", note: "dedup shared params (β, σ…) into the system set." },
  { id: "S6", name: "cross-check", coupling: "check", from: "Assembled model", to: "Checked model", note: "captured vars vs figure panels → completeness gate." },
  { id: "S7", name: "verify", coupling: "audit", from: "Checked model", to: "Verified-by-machine", note: "2nd model audits each slot before storage." },
  { id: "S8", name: "store", coupling: "move", from: "Verified-by-machine", to: "Database (staging)", point: "store", note: "store it ALL — model + lineage + verdict." },
  { id: "S9", name: "human verdict (V8)", coupling: "gate", from: "Database (staging)", to: "Human / review", note: "approve promotes to verified. The human gate." },
  { id: "S10", name: "promote", coupling: "move", from: "Human / review", to: "Library", note: "verified models → searchable Library." },
];

const COUPLING_LABEL: Record<Coupling, string> = {
  move: "move · 1→1", fanout: "transform · 1→many", enrich: "enrich", merge: "merge · N→1",
  check: "check", audit: "audit", gate: "human gate",
};

function outcomeTone(s?: SeamStat): { dot: string; line: string } {
  if (!s || s.count === 0) return { dot: "bg-ink-faint", line: "border-ink-faint/40" };
  if (s.fail > 0) return { dot: "bg-invalid", line: "border-invalid/60" };
  if (s.flag > 0) return { dot: "bg-attention", line: "border-attention/60" };
  return { dot: "bg-present", line: "border-present/60" };
}

function reduced(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SeamMap() {
  const [stats, setStats] = useState<Record<string, SeamStat>>({});
  const [vh, setVh] = useState<ValidationHealth>({ extracted: 0, needsHuman: 0, verified: 0, failedJobs: 0 });
  useEffect(() => {
    loadSeamTelemetry().then(setStats);
    loadValidationHealth().then(setVh);
  }, []);

  // telemetry text per seam: real validation_events where emitted, else known counts, else "designed".
  function telemetry(seam: SeamDef): { lines: string[]; live: boolean } {
    const s = seam.point ? stats[seam.point] : undefined;
    if (s && s.count > 0) {
      const lines = [`${s.count} runs · ${s.pass}✓ ${s.flag}⚑ ${s.fail}✕`];
      if (s.avgLatencyMs != null) lines.push(`~${s.avgLatencyMs} ms`);
      if (seam.coupling === "fanout" && s.lastTags) {
        const t = s.lastTags as Record<string, number>;
        const pieces = (t.vars ?? 0) + (t.params ?? 0) + (t.drift ?? 0) + (t.diffusion ?? 0);
        lines.push(`last: ${pieces} pieces (${t.vars ?? 0} vars · ${t.params ?? 0} params)`);
      }
      if (seam.point === "locate" && s.lastTags) {
        const t = s.lastTags as Record<string, number>;
        lines.push(`located ${t.located ?? 0} · missing ${t.missing ?? 0}`);
      }
      return { lines, live: true };
    }
    if (seam.id === "S8") return { lines: [`${vh.extracted} stored`], live: vh.extracted > 0 };
    if (seam.id === "S9") return { lines: [`${vh.needsHuman} awaiting · ${vh.verified} approved`], live: vh.needsHuman + vh.verified > 0 };
    if (seam.id === "S10") return { lines: [`${vh.verified} in Library`], live: vh.verified > 0 };
    if (seam.planned) return { lines: ["planned"], live: false };
    return { lines: ["no telemetry yet"], live: false };
  }

  const animate = !reduced();

  return (
    <Card className="flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Data flow · the seams</span>
        <span className="text-[11px] text-ink-faint">drawers (systems) · seams (transfers) — watch at the seams</span>
      </div>

      {/* converging intake header */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-inset px-3 py-2 text-[11px]">
        <span className="text-ink-faint uppercase tracking-wide">intake →</span>
        <Badge tone="green">PDF upload</Badge>
        <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] text-ink-faint">DOI fetch · planned</span>
        <span className="text-ink-faint">→ converge at the job queue → the pipeline below</span>
      </div>

      <div className="flex flex-col">
        {/* first drawer */}
        <DrawerRow name={SEAMS[0].from} form="PDF bytes + papers row" />
        {SEAMS.map((seam) => {
          const t = telemetry(seam);
          const s = seam.point ? stats[seam.point] : undefined;
          const tone = outcomeTone(s);
          return (
            <div key={seam.id}>
              <SeamRow seam={seam} telemetry={t} tone={tone} animate={animate} />
              <DrawerRow name={seam.to} form="" planned={seam.planned} />
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        Telemetry richness follows coupling: a <span className="text-ink-dim">move</span> (1→1) shows little; the
        <span className="text-ink-dim"> transform/fan-out</span> at <span className="mono">extract</span> (one PDF → many pieces) carries the most.
        Real counts come from <span className="mono">validation_events</span>; “no telemetry yet” is honest, not hidden.
      </p>
    </Card>
  );
}

function DrawerRow({ name, form, planned }: { name: string; form: string; planned?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between rounded-md border px-3 py-1.5",
      planned ? "border-dashed border-edge/60 opacity-60" : "border-edge bg-surface-raised/40")}>
      <span className="text-xs font-medium text-ink">{name}</span>
      {form && <span className="text-[10px] text-ink-faint">{form}</span>}
    </div>
  );
}

function SeamRow({ seam, telemetry, tone, animate }: {
  seam: SeamDef;
  telemetry: { lines: string[]; live: boolean };
  tone: { dot: string; line: string };
  animate: boolean;
}) {
  const isFanout = seam.coupling === "fanout";
  // the connector: a vertical line (move/etc) or a downward burst (fan-out). Telemetry-as-shape.
  const flow: CSSProperties = animate && telemetry.live
    ? { backgroundImage: "linear-gradient(to bottom, currentColor 50%, transparent 50%)", backgroundSize: "2px 8px", animation: "sde-flow 0.8s linear infinite" }
    : {};
  return (
    <div className="flex items-stretch gap-3 py-1 pl-1" title={seam.note}>
      {/* the connector shape */}
      <div className="flex w-10 shrink-0 flex-col items-center justify-center">
        {isFanout ? (
          <div className="relative h-8 w-10">
            {[-16, -8, 0, 8, 16].map((dx, i) => (
              <span key={i} className={cx("absolute left-1/2 top-0 h-8 w-px origin-top", tone.line.replace("border", "bg").replace("/60", "/70"))}
                style={{ transform: `translateX(${dx}px) rotate(${dx * 1.4}deg)` }} />
            ))}
          </div>
        ) : (
          <div className={cx("h-8 w-0 border-l-2", tone.line)} style={flow} />
        )}
        <span className={cx("mt-0.5 h-1.5 w-1.5 rounded-full", tone.dot)} />
      </div>
      {/* the seam label + telemetry */}
      <div className="flex flex-1 items-center justify-between gap-3 py-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] text-ink-faint">{seam.id}</span>
            <span className="text-xs font-medium text-ink">{seam.name}</span>
            <span className={cx("rounded px-1.5 py-0.5 text-[9px]", isFanout ? "bg-active-soft text-active" : "bg-surface-raised text-ink-faint")}>{COUPLING_LABEL[seam.coupling]}</span>
          </div>
          <div className="truncate text-[10px] text-ink-faint">{seam.note}</div>
        </div>
        <div className="shrink-0 text-right">
          {telemetry.lines.map((l, i) => (
            <div key={i} className={cx("mono text-[10px]", telemetry.live ? "text-ink-dim" : "text-ink-faint")}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
