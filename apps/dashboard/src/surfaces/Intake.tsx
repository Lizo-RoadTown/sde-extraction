import { useState } from "react";
import { Card, SectionTitle, Badge, StatCard } from "../ui";
import { jobs } from "../mock";

// Engine-found figures the user confirms (locked decision: engine enumerates, user confirms).
const foundFigures = [
  { label: "Figure 1", caption: "Deterministic SIR trajectories", page: 6 },
  { label: "Figure 2", caption: "Stochastic realizations (σ = 5E-6)", page: 12 },
  { label: "Figure 3", caption: "Sensitivity to noise intensity", page: 14 },
];

const stageLabel: Record<string, string> = {
  ingest: "Ingest", pdf_to_math: "PDF→math", extract: "Extract",
  machine_verify: "Machine verify", human_verify: "Human verify", stored: "Stored", failed: "Failed",
};

export function Intake() {
  const [picked, setPicked] = useState<string[]>(["Figure 2"]);
  const toggle = (l: string) =>
    setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="A PDF is the only input. It's fingerprinted (SHA-256) the moment it lands.">
        Intake
      </SectionTitle>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center">
          <div className="text-3xl">📄</div>
          <div className="text-sm text-slate-300">Drop a paper PDF here</div>
          <div className="text-xs text-slate-500">or click to browse · fingerprinted on upload</div>
          <button className="mt-2 rounded-md bg-cyan-500/20 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/30">
            Choose PDF
          </button>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Figures found</span>
            <Badge tone="cyan">engine found 3 · you confirm</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {foundFigures.map((f) => (
              <label key={f.label} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-700/60 px-3 py-2 hover:bg-slate-800/50">
                <input type="checkbox" checked={picked.includes(f.label)} onChange={() => toggle(f.label)} className="accent-cyan-400" />
                <div className="flex-1">
                  <div className="text-sm text-slate-200">{f.label}</div>
                  <div className="text-xs text-slate-500">{f.caption} · p.{f.page}</div>
                </div>
              </label>
            ))}
          </div>
          <button className="mt-3 w-full rounded-md bg-cyan-500/20 py-2 text-sm text-cyan-200 hover:bg-cyan-500/30">
            Extract {picked.length} figure{picked.length === 1 ? "" : "s"} →
          </button>
        </Card>
      </div>

      <div>
        <SectionTitle>Intake queue</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Queued" value="1" />
          <StatCard label="Processing" value="3" tone="cyan" />
          <StatCard label="Done today" value="12" tone="green" />
          <StatCard label="Failed" value="1" tone="red" />
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Paper</th><th className="px-4 py-2">Figure</th>
                <th className="px-4 py-2">Stage</th><th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2 text-slate-300">{j.paper}</td>
                  <td className="px-4 py-2 text-slate-400">{j.figure}</td>
                  <td className="px-4 py-2">
                    <Badge tone={j.stage === "failed" ? "red" : j.stage === "stored" ? "green" : "cyan"}>
                      {stageLabel[j.stage]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{j.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
