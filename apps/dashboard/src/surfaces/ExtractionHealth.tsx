import { lazy, Suspense, useState } from "react";
import { SectionTitle, cx } from "../ui";
import { SeamMap } from "./SeamMap";
import { activePath } from "../lib/supabase";

// Extraction Health = observability, and observability shows ONLY real telemetry. No fabricated
// "sample" gauges/confidence/self-update (they read as real and mislead — Liz, 2026-06-14), and
// no standalone V1–V8 diagram: the gates are governance that attaches AT THE SEAMS, so they belong
// folded into the seam map, not a parallel chart. The tab is the seam map, driven by
// validation_events: 2D for precise counts/latency, 3D for the gestalt of data flowing.

// 3D view is lazy-loaded so three.js (~130KB gz) only enters the bundle when the user opens it.
const SeamMap3D = lazy(() => import("./SeamMap3D").then((m) => ({ default: m.SeamMap3D })));

export function ExtractionHealth() {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const path = activePath();
  const isDagster = path.schema === "dagster_app";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="Where the data rests (drawers) and every place it transfers (seams). We watch at the seams — governance attaches where the data moves. Everything here is real validation_events; nothing is sampled.">
        Extraction Health
      </SectionTitle>

      {/* Which path's telemetry this is — the two paths write SEPARATE schemas, so the seam map below
          is this path's runs only. On the Dagster path the same seams are produced by an orchestrated,
          retriable, ordered Dagster job (detect → extract → reproduce → store); on the direct path by
          a single OpenAI/Pydantic call. */}
      <div className="rounded-md border border-edge bg-inset px-3 py-2 text-[11px] text-ink-dim">
        <span className="text-ink-faint">path </span>
        <span className="mono text-ink">{path.label}</span>
        <span className="text-ink-faint"> · {isDagster
          ? "stages run as an orchestrated, retriable Dagster job — each seam below is one observable step"
          : "a single OpenAI/Pydantic call — no workflow orchestration around the seams"}</span>
      </div>

      {/* the seam map — 2D is the precise view (exact counts/latency); 3D is the gestalt of data
          flowing through the system (depth). Both from the same validation_events. */}
      <div>
        <div className="mb-2 flex items-center justify-end">
          <div className="flex rounded-md border border-edge p-0.5 text-[11px]">
            {(["2d", "3d"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={cx("rounded px-2 py-0.5 uppercase tracking-wide transition-colors",
                  view === v ? "bg-surface-raised text-ink" : "text-ink-faint hover:text-ink-dim")}>
                {v === "2d" ? "2D · precise" : "3D · flow"}
              </button>
            ))}
          </div>
        </div>
        {view === "2d" ? (
          <SeamMap />
        ) : (
          <Suspense fallback={
            <div className="flex h-[420px] items-center justify-center rounded-md border border-edge bg-inset text-sm text-ink-faint">
              loading 3D view…
            </div>
          }>
            <SeamMap3D />
          </Suspense>
        )}
      </div>
    </div>
  );
}
