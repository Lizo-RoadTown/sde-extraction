import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Badge, CompletenessChip } from "../ui";
import { loadLibrary, slotCounts } from "../data";
import type { FigureExtraction } from "../types";

export function Library() {
  const [library, setLibrary] = useState<FigureExtraction[]>([]);
  const [q, setQ] = useState("");
  const [pathogen, setPathogen] = useState("All");
  useEffect(() => {
    loadLibrary().then(setLibrary);
  }, []);

  // Real facet: the pathogens actually present in the library (not an invented list).
  const pathogens = useMemo(
    () => ["All", ...Array.from(new Set(library.map((m) => m.pathogen).filter(Boolean))).sort()],
    [library],
  );

  // Real search + filter over the loaded models.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return library.filter((m) => {
      if (pathogen !== "All" && m.pathogen !== pathogen) return false;
      if (!needle) return true;
      return [m.figureLabel, m.figureType, m.pathogen, m.doi]
        .some((s) => (s ?? "").toLowerCase().includes(needle));
    });
  }, [library, q, pathogen]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Browse verified (paper, figure) models — the structured archive.">
        Library
      </SectionTitle>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by figure, type, pathogen, or DOI…"
        className="w-full rounded-md border border-edge bg-surface-raised/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-active-edge focus:outline-none"
      />

      {/* one real facet, derived from the data; more are added when there's a field to back them */}
      {pathogens.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">Pathogen</span>
          <select value={pathogen} onChange={(e) => setPathogen(e.target.value)}
            className="w-48 rounded-md border border-edge bg-surface-raised/50 px-3 py-1.5 text-sm text-ink">
            {pathogens.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      )}

      {library.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-faint">
          No verified models yet. Extractions appear here once they pass human verification.
        </Card>
      ) : shown.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-faint">No models match your search.</Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => (
          <Card key={m.id} className="flex flex-col gap-2 hover:border-active-edge">
            <div className="text-sm font-medium text-ink">{m.figureLabel}{m.figureType ? ` · ${m.figureType}` : ""}</div>
            <div className="text-xs text-ink-faint">{m.pathogen}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="mono text-[11px] text-ink-faint">{m.doi}</span>
              <div className="flex items-center gap-1.5">
                <CompletenessChip {...slotCounts(m)} />
                {/* Everything here passed human review, so that's the true badge. Figure reproduction
                    is a separate oracle not in the live path yet — only assert it when it really ran. */}
                <Badge tone="green">human-verified</Badge>
                {m.figureReproduced === true && <Badge tone="cyan">figure reproduced</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
