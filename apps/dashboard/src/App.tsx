import { useState } from "react";
import { Papers } from "./surfaces/Papers";
import { Library } from "./surfaces/Library";
import { ExtractionHealth } from "./surfaces/ExtractionHealth";
import { cx } from "./ui";
import { AuthGate } from "./auth";
import { usePreview, setPreview } from "./usePreview";

// Organized by the real work motion: add a paper + verify it (one surface),
// browse the verified archive, and the engine's telemetry/confidence.
type Surface = "papers" | "library" | "health";

const NAV: { key: Surface; label: string; blurb: string }[] = [
  { key: "papers", label: "Papers", blurb: "add · verify" },
  { key: "library", label: "Library", blurb: "verified models" },
  { key: "health", label: "Extraction Health", blurb: "telemetry · confidence" },
];

export default function App() {
  const [surface, setSurface] = useState<Surface>("papers");
  const preview = usePreview();

  return (
    <AuthGate>
    {preview && (
      <div className="bg-attention-soft py-1 text-center text-[11px] text-attention">
        PREVIEW MODE — showing labeled sample data (not real extractions). Toggle off in the header.
      </div>
    )}
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
            <PreviewToggle />
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-present" />
              engine + loom: live
            </span>
            <span className="rounded-full bg-surface-raised px-2 py-1">Liz · lead</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {surface === "papers" && <Papers />}
          {surface === "library" && <Library />}
          {surface === "health" && <ExtractionHealth />}
        </main>
      </div>
    </div>
    </AuthGate>
  );
}

// Dev-only toggle to view labeled sample data in an empty system.
function PreviewToggle() {
  const preview = usePreview();
  return (
    <button
      type="button"
      onClick={() => setPreview(!preview)}
      title="Show labeled sample data so the filled UI is visible before real extractions run"
      className={cx(
        "rounded-full px-2 py-1 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active",
        preview ? "bg-attention-soft text-attention" : "bg-surface-raised text-ink-faint hover:text-ink",
      )}
    >
      preview {preview ? "on" : "off"}
    </button>
  );
}
