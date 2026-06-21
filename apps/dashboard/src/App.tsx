import { SingleRun } from "./surfaces/SingleRun";
import { Queue } from "./surfaces/Queue";
import { Library } from "./surfaces/Library";
import { ExtractionHealth } from "./surfaces/ExtractionHealth";
import { AgentHealth } from "./surfaces/AgentHealth";
import { VerifyPage } from "./surfaces/VerifyPage";
import { FingerprintJourney } from "./surfaces/FingerprintJourney";
import { SAMPLE_EXTRACTION } from "./preview";
import { cx } from "./ui";
import { AuthGate } from "./auth";
import { usePreview, setPreview } from "./usePreview";
import { useRoute, matchVerify, Link } from "./router";
import { supabaseConfigured } from "./lib/supabase";
import { loadHeartbeat } from "./data";
import { useEffect, useState } from "react";

// Real routing (hash-based) so every view is a back-able URL. The work splits in two:
// a Single-run page that does one paper end to end inline, and a Queue page for batches
// where each item opens its own verify page.
// The first two tabs are the two AUDIENCES (Liz): a guided walkthrough for new/skeptical
// users who want to see the proof, and a fast bulk lane for power users who already trust it.
const NAV: { to: string; label: string; blurb: string }[] = [
  { to: "/", label: "Walkthrough", blurb: "guided · see every step" },
  { to: "/queue", label: "Bulk", blurb: "ingest + verify, fast" },
  { to: "/library", label: "Library", blurb: "verified models" },
  { to: "/health", label: "Extraction Health", blurb: "gates · point health" },
  { to: "/agents", label: "Agent Health", blurb: "the agents at each gate" },
];

// External destinations (link OUT from the header — NOT app surfaces). Documentation is its own
// site (apps/docs, deployed separately); set VITE_DOCS_URL to its URL. Until it's deployed, this
// falls back to the docs source on GitHub.
const GITHUB_URL = "https://github.com/Lizo-RoadTown/sde-extraction";
const DOCS_URL = (import.meta.env.VITE_DOCS_URL as string | undefined)
  || "https://sde-extraction-jiow.vercel.app";

function isActive(route: string, to: string): boolean {
  return to === "/" ? route === "/" : route === to || route.startsWith(to + "/");
}

function CurrentView({ route }: { route: string }) {
  const verifyId = matchVerify(route);
  if (verifyId) return <VerifyPage id={verifyId} />;
  if (route === "/queue") return <Queue />;
  if (route === "/library") return <Library />;
  if (route === "/health") return <ExtractionHealth />;
  if (route === "/agents") return <AgentHealth />;
  if (route === "/fingerprint") return <FingerprintJourney ext={SAMPLE_EXTRACTION} />; // aesthetic sandbox
  return <SingleRun />; // "/" and any unknown route
}

function currentLabel(route: string): string {
  if (matchVerify(route)) return "Verify";
  return NAV.find((n) => isActive(route, n.to))?.label ?? "Single run";
}

export default function App() {
  const preview = usePreview();
  const route = useRoute();

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
        <Link to="/" title="Home — Walkthrough"
          className="mb-6 block rounded-lg px-2 pt-2 pb-1 transition hover:bg-surface-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
          <div className="display text-xl text-ink">⌂ SDE <span className="display-accent">Extraction</span></div>
          <div className="text-xs text-ink-faint">paper → provable model · home</div>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cx(
                "rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active",
                isActive(route, n.to)
                  ? "bg-active-soft text-active"
                  : "text-ink-dim hover:bg-surface-raised/60",
              )}
            >
              <div className="font-medium">{n.label}</div>
              <div className="text-[11px] text-ink-faint">{n.blurb}</div>
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2 pb-2 text-[11px] text-ink-faint">single team · MVP</div>
      </aside>

      {/* main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-13 items-center justify-between border-b border-edge px-6 py-3">
          <div className="text-sm text-ink-dim">{currentLabel(route)}</div>
          <div className="flex items-center gap-3 text-xs text-ink-dim">
            <a href={DOCS_URL} target="_blank" rel="noreferrer"
              className="rounded-full px-2 py-1 text-ink-faint transition hover:bg-surface-raised hover:text-ink">
              Documentation ↗
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer"
              className="rounded-full px-2 py-1 text-ink-faint transition hover:bg-surface-raised hover:text-ink">
              GitHub ↗
            </a>
            <PreviewToggle />
            <Heartbeat />
            <span className="rounded-full bg-surface-raised px-2 py-1">Liz · lead</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <CurrentView route={route} />
        </main>
      </div>
    </div>
    </AuthGate>
  );
}

// The extraction-path chooser lives ON the Walkthrough page (SingleRun's PathChooser), where the
// choice is made before upload — so it's intentionally NOT duplicated in the header.

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

// Real telemetry heartbeat — reflects the actual latest validation_events timestamp, not a hardcoded
// "live". Green only if there's been activity in the last 15 min; otherwise it honestly says how long
// it's been quiet (or that there's no activity / no backend yet). Never asserts "live" without evidence.
function relTime(iso: string): { label: string; recent: boolean } {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  const recent = mins < 15;
  if (mins < 1) return { label: "just now", recent };
  if (mins < 60) return { label: `${mins}m ago`, recent };
  const h = Math.round(mins / 60);
  if (h < 24) return { label: `${h}h ago`, recent };
  return { label: `${Math.round(h / 24)}d ago`, recent };
}

function Heartbeat() {
  const [last, setLast] = useState<string | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    let live = true;
    loadHeartbeat().then((v) => { if (live) setLast(v); });
    return () => { live = false; };
  }, []);
  if (!supabaseConfigured) {
    return <span className="text-ink-faint" title="No backend configured (mock mode)">telemetry: mock</span>;
  }
  if (last === undefined) return <span className="text-ink-faint">telemetry: …</span>;
  if (last === null) {
    return <span className="text-ink-faint" title="No validation_events recorded yet">telemetry: no activity yet</span>;
  }
  const { label, recent } = relTime(last);
  return (
    <span className="flex items-center gap-1.5" title={`last telemetry event ${label} (validation_events)`}>
      <span className={cx("h-2 w-2 rounded-full", recent ? "animate-pulse bg-present" : "bg-ink-faint")} />
      telemetry · {label}
    </span>
  );
}
