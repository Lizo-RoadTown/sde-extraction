import { useState } from "react";
import { Intake } from "./surfaces/Intake";
import { Process } from "./surfaces/Process";
import { Verify } from "./surfaces/Verify";
import { Library } from "./surfaces/Library";
import { cx } from "./ui";
import { AuthGate } from "./auth";

type Surface = "intake" | "process" | "verify" | "library";

const NAV: { key: Surface; label: string; blurb: string }[] = [
  { key: "intake", label: "Intake", blurb: "PDF in" },
  { key: "process", label: "Process", blurb: "watch the engine" },
  { key: "verify", label: "Verify", blurb: "present / absent + figure" },
  { key: "library", label: "Library", blurb: "verified models" },
];

export default function App() {
  const [surface, setSurface] = useState<Surface>("verify");

  return (
    <AuthGate>
    <div className="flex min-h-screen">
      {/* sidebar nav */}
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-6 px-2 pt-2">
          <div className="text-sm font-semibold tracking-wide text-cyan-300">SDE Extraction</div>
          <div className="text-xs text-slate-500">paper → provable model</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setSurface(n.key)}
              className={cx(
                "rounded-md px-3 py-2 text-left text-sm transition",
                surface === n.key
                  ? "bg-cyan-500/15 text-cyan-200"
                  : "text-slate-300 hover:bg-slate-800/60",
              )}
            >
              <div className="font-medium">{n.label}</div>
              <div className="text-[11px] text-slate-500">{n.blurb}</div>
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 pb-2 text-[11px] text-slate-600">single team · MVP</div>
      </aside>

      {/* main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-13 items-center justify-between border-b border-slate-800 px-6 py-3">
          <div className="text-sm text-slate-400">
            {NAV.find((n) => n.key === surface)?.label}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              engine + loom: live
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-1">Liz · lead</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {surface === "intake" && <Intake />}
          {surface === "process" && <Process />}
          {surface === "verify" && <Verify />}
          {surface === "library" && <Library />}
        </main>
      </div>
    </div>
    </AuthGate>
  );
}
