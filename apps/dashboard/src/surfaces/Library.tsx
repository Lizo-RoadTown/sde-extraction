import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "../ui";
import { loadLibrary } from "../data";
import type { FigureExtraction } from "../types";

const facets = [
  { name: "Pathogen", options: ["All", "Malaria", "Dengue", "Influenza", "Hepatitis B", "Cholera"] },
  { name: "Formulation family", options: ["All", "Env. noise", "Demographic", "OU process", "Chemical Langevin"] },
  { name: "Year", options: ["All", "2025", "2024", "2023", "2022"] },
  { name: "Model features", options: ["All", "Vaccination", "≥5 compartments", "Lévy jumps"] },
];

export function Library() {
  const [library, setLibrary] = useState<FigureExtraction[]>([]);
  useEffect(() => {
    loadLibrary().then(setLibrary);
  }, []);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Browse verified (paper, figure) models — the structured archive.">
        Library
      </SectionTitle>

      <input
        placeholder="Search verified models…"
        className="w-full rounded-md border border-edge bg-surface-raised/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-active-edge focus:outline-none"
      />

      <div className="flex flex-wrap gap-3">
        {facets.map((f) => (
          <label key={f.name} className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">{f.name}</span>
            <select className="rounded-md border border-edge bg-surface-raised/50 px-3 py-1.5 text-sm text-ink">
              {f.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {library.map((m) => (
          <Card key={m.id} className="flex flex-col gap-2 hover:border-active-edge">
            <div className="flex h-24 items-center justify-center rounded-md bg-inset/60 text-ink-faint">📈 figure</div>
            <div className="text-sm font-medium text-ink">{m.paperTitle}</div>
            <div className="text-xs text-ink-faint">{m.figureLabel} · {m.pathogen}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="mono text-[11px] text-ink-faint">{m.doi}</span>
              <Badge tone={m.figureReproduced ? "green" : "slate"}>{m.figureReproduced ? "verified ✓" : "pending"}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
