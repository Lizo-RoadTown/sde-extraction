import { useState } from "react";
import { Intake } from "./surfaces/Intake";
import { Verify } from "./surfaces/Verify";
import { Library } from "./surfaces/Library";
import { ExtractionHealth } from "./surfaces/ExtractionHealth";
import { cx } from "./ui";
import { AuthGate } from "./auth";

// Organized by what a human does, not by pipeline stage (Process dissolved —
// see docs/superpowers/specs/2026-06-12-dashboard-nav-redesign-design.md).
type Surface = "intake" | "verify" | "library" | "health";

const NAV: { key: Surface; label: string; blurb: string }[] = [
  { key: "intake", label: "Intake", blurb: "add papers · watch them process" },
  { key: "verify", label: "Verify", blurb: "present / absent + figure" },
  { key: "library", label: "Library", blurb: "verified models" },
  { key: "health", label: "Extraction Health", blurb: "confidence · self-update" },
];

export default function App() {
  const [surface, setSurface] = useState<Surface>("verify");

  return (
    <AuthGate>
    <div className="flex min-h-screen">
      {/* sidebar nav */}
      <aside className="flex w-56 flex-col border-r border-edge bg-inset/60 p-3">
        <div className="mb-6 px-2 pt-2">
          <div className="display text-xl text-ink">SDE <span className="display-accent">Extraction</span></div>
          <div className="text-xs text-ink-faint">paper → provable model</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              type="button"
              key={n.key}
              onClick={() => setSurface(n.key)}
              className={cx(
                "rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active",
                surface === n.key
                  ? "bg-active-soft text-active"
                  : "text-ink-dim hover:bg-surface-raised/60",
              )}
            >
              <div className="font-medium">{n.label}</div>
              <div className="text-[11px] text-ink-faint">{n.blurb}</div>
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 pb-2 text-[11px] text-ink-faint">single team · MVP</div>
      </aside>

      {/* main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-13 items-center justify-between border-b border-edge px-6 py-3">
          <div className="text-sm text-ink-dim">
            {NAV.find((n) => n.key === surface)?.label}
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-dim">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-present" />
              engine + loom: live
            </span>
            <span className="rounded-full bg-surface-raised px-2 py-1">Liz · lead</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {surface === "intake" && <Intake />}
          {surface === "verify" && <Verify />}
          {surface === "library" && <Library />}
          {surface === "health" && <ExtractionHealth />}
        </main>
      </div>
    </div>
    </AuthGate>
  );
}
