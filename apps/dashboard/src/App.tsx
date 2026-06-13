import { SingleRun } from "./surfaces/SingleRun";
import { Queue } from "./surfaces/Queue";
import { Library } from "./surfaces/Library";
import { ExtractionHealth } from "./surfaces/ExtractionHealth";
import { VerifyPage } from "./surfaces/VerifyPage";
import { FingerprintJourney } from "./surfaces/FingerprintJourney";
import { SAMPLE_EXTRACTION } from "./preview";
import { cx } from "./ui";
import { AuthGate } from "./auth";
import { usePreview, setPreview } from "./usePreview";
import { useRoute, matchVerify, Link } from "./router";

// Real routing (hash-based) so every view is a back-able URL. The work splits in two:
// a Single-run page that does one paper end to end inline, and a Queue page for batches
// where each item opens its own verify page.
const NAV: { to: string; label: string; blurb: string }[] = [
  { to: "/", label: "Single run", blurb: "one paper · verify inline" },
  { to: "/queue", label: "Queue", blurb: "batch · awaiting review" },
  { to: "/library", label: "Library", blurb: "verified models" },
  { to: "/health", label: "Extraction Health", blurb: "telemetry · confidence" },
];

function isActive(route: string, to: string): boolean {
  return to === "/" ? route === "/" : route === to || route.startsWith(to + "/");
}

function CurrentView({ route }: { route: string }) {
  const verifyId = matchVerify(route);
  if (verifyId) return <VerifyPage id={verifyId} />;
  if (route === "/queue") return <Queue />;
  if (route === "/library") return <Library />;
  if (route === "/health") return <ExtractionHealth />;
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
        <div className="mb-6 px-2 pt-2">
          <div className="display text-xl text-ink">SDE <span className="display-accent">Extraction</span></div>
          <div className="text-xs text-ink-faint">paper → provable model</div>
        </div>
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
            <PreviewToggle />
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-present" />
              engine + loom: live
            </span>
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
