import { useEffect, useState } from "react";
import { Card, Badge, cx } from "../ui";
import { loadOrchestrationRuns, type OrchestrationRun } from "../data";
import { activePath } from "../lib/supabase";

// OUR custom observability surface — never Dagster's UI. Every run on the Dagster path captures its
// COMPLETE record (run id, status, timing, per-op rollup, every event) into orchestration_runs
// (services/extraction/dagster_flow.py:_capture_run → worker.py → db.write_orchestration_run). This
// renders that capture: runs list → per-run per-op status/timing → the full event stream. If a run
// isn't here, it didn't get captured — which is itself a signal. For BioModels; ours; open-source.

const STATUS_TONE: Record<string, "green" | "red" | "amber" | "slate"> = {
  success: "green", failed: "red", retrying: "amber", skipped: "slate", running: "amber",
};

function statusTone(s: string | null | undefined): "green" | "red" | "amber" | "slate" {
  return STATUS_TONE[(s || "").toLowerCase()] ?? "slate";
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

function fmtWhen(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// A human label for the raw Dagster event type — the capture stores the raw enum; we make it legible
// without hiding it (the raw type is still shown in the stream).
const EVENT_LABEL: Record<string, string> = {
  PIPELINE_START: "run started", RUN_START: "run started",
  PIPELINE_SUCCESS: "run succeeded", RUN_SUCCESS: "run succeeded",
  PIPELINE_FAILURE: "run failed", RUN_FAILURE: "run failed",
  STEP_START: "op started", STEP_SUCCESS: "op succeeded", STEP_FAILURE: "op failed",
  STEP_UP_FOR_RETRY: "op retrying", STEP_SKIPPED: "op skipped",
  STEP_INPUT: "input", STEP_OUTPUT: "output", LOGS_CAPTURED: "logs",
};

function RunDetail({ run }: { run: OrchestrationRun }) {
  const steps = Object.values(run.steps ?? {});
  const events = run.events ?? [];
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-edge pt-3">
      {/* per-op rollup — the ordered, observable steps Dagster ran (detect/extract/reproduce/store) */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">ops</div>
        {steps.length === 0 ? (
          <div className="text-[11px] text-ink-faint">no per-op events captured</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {steps.map((s) => (
              <div key={s.op} className="flex items-center justify-between gap-3 rounded border border-edge bg-inset px-2 py-1">
                <span className="mono text-[12px] text-ink">{s.op}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-faint">{s.events.length} event{s.events.length === 1 ? "" : "s"}</span>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* the FULL event stream — nothing dropped; this is the whole point of capturing everything */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">event stream ({events.length})</div>
        <div className="max-h-64 overflow-auto rounded border border-edge bg-inset">
          <table className="w-full text-[11px]">
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-b border-edge/40 last:border-0">
                  <td className="px-2 py-0.5 text-ink-faint tabular-nums">{i + 1}</td>
                  <td className="px-2 py-0.5 mono text-ink-dim">{e.type}</td>
                  <td className="px-2 py-0.5 text-ink-faint">{EVENT_LABEL[e.type] ?? ""}</td>
                  <td className="px-2 py-0.5 mono text-ink-faint">{e.step ?? ""}</td>
                  <td className="px-2 py-0.5 text-ink-dim">{e.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function OrchestrationRuns() {
  const [runs, setRuns] = useState<OrchestrationRun[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const path = activePath();
  const isDagster = path.schema === "dagster_app";

  useEffect(() => { loadOrchestrationRuns().then(setRuns); }, []);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Orchestration runs</div>
          <div className="text-[11px] text-ink-faint">
            Our own capture of every Dagster run — run id, status, timing, per-op rollup, the full event
            stream. Not Dagster's UI; ours.
          </div>
        </div>
        <span className="mono text-[11px] text-ink-dim">{path.label}</span>
      </div>

      {runs === null ? (
        <div className="text-[11px] text-ink-faint">loading runs…</div>
      ) : !isDagster ? (
        // honest with/without difference: the direct path has no orchestration, so nothing is captured
        <div className="rounded border border-edge bg-inset px-3 py-2 text-[11px] text-ink-dim">
          This path runs a single OpenAI/Pydantic call — there is no orchestration to capture, so there
          are no runs here. Switch to <span className="text-ink">Dagster + OpenAI / Pydantic</span> (top
          of the page) to see captured runs. The empty state here <em>is</em> the with/without difference.
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded border border-edge bg-inset px-3 py-2 text-[11px] text-ink-dim">
          No runs captured yet on this path. Once the Dagster worker processes a job, its complete run
          record lands here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((r) => {
            const isOpen = open === r.id;
            return (
              <div key={r.id} className="rounded-md border border-edge">
                <button type="button" onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-inset">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge tone={statusTone(r.status)}>{r.status ?? "?"}</Badge>
                    <span className="mono truncate text-[12px] text-ink" title={r.run_id ?? ""}>
                      {r.run_id ? r.run_id.slice(0, 8) : "(no run id)"}
                    </span>
                    <span className="text-[11px] text-ink-faint">{fmtWhen(r.created_at)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-[11px] text-ink-dim">
                    <span className="tabular-nums">{fmtDuration(r.duration_ms)}</span>
                    <span className="tabular-nums">{r.event_count ?? 0} ev</span>
                    <span className="text-ink-faint">{Object.keys(r.steps ?? {}).length} ops</span>
                    <span className={cx("transition-transform", isOpen && "rotate-90")}>›</span>
                  </div>
                </button>
                {isOpen && <div className="px-3 pb-3"><RunDetail run={r} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
