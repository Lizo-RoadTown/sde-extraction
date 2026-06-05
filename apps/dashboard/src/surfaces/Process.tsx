import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge, StatCard } from "../ui";
import { loadJobs } from "../data";
import type { Job } from "../types";

// Our pipeline stages, fed by OTel → loom + Supabase job rows.
const stages = [
  { key: "ingest", label: "Ingest", count: 1 },
  { key: "pdf_to_math", label: "PDF→math", count: 1 },
  { key: "extract", label: "Extract", count: 1 },
  { key: "machine_verify", label: "Machine verify", count: 1 },
  { key: "human_verify", label: "Human verify", count: 2 },
  { key: "stored", label: "Stored", count: 12 },
];

export function Process() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    loadJobs().then(setJobs);
  }, []);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Watch the engine work. Status fed by OTel → the-loom; click a job for its trace (the hash/extract/verify spans).">
        Process
      </SectionTitle>

      {/* pipeline flow */}
      <Card>
        <div className="flex items-center justify-between gap-2 overflow-x-auto">
          {stages.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className="flex min-w-[92px] flex-col items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/40 px-3 py-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{s.label}</span>
                <span className="text-lg font-semibold text-slate-100">{s.count}</span>
              </div>
              {i < stages.length - 1 && <span className="text-slate-600">→</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* gauges */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Figure-repro pass" value="86%" tone="green" />
        <StatCard label="Present / absent" value="73 / 27" tone="cyan" />
        <StatCard label="Throughput / hr" value="9" />
        <StatCard label="Avg verify" value="3.4m" />
      </div>

      {/* jobs with per-stage trace hint */}
      <div>
        <SectionTitle>Active jobs</SectionTitle>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Job</th><th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Progress</th><th className="px-4 py-2">Trace</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2 text-slate-300">{j.paper} · {j.figure}</td>
                  <td className="px-4 py-2">
                    <Badge tone={j.stage === "failed" ? "red" : "cyan"}>{j.stage}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-700">
                      <div className={j.stage === "failed" ? "h-full bg-red-400" : "h-full bg-cyan-400"} style={{ width: `${Math.round(j.progress * 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button className="mono text-xs text-cyan-300 hover:underline">view spans ↗</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* self-update loop (the curation's loop — kept) */}
      <div>
        <SectionTitle hint="The same self-updating loop the curation had: agents propose improvements, a human approves, trust accrues.">
          Agent self-update
        </SectionTitle>
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-200">Extractor proposes: tighten σ sourcing to caption-first</div>
            <div className="text-xs text-slate-500">predicted +6% figure-repro pass · trust 0.81</div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30">Approve</button>
            <button className="rounded-md bg-slate-700/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">Reject</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
