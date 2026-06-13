import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cx } from "../ui";
import type { FigureExtraction, Slot } from "../types";

// AESTHETIC SANDBOX (#/fingerprint) — the extraction dramatized as a SEARCH QUEST over the
// page (Liz, 2026-06-12). The scan roams the page hunting for each thing the figure needs;
// "Aha! diffusion term located!" → the value pops and its blurred numbers resolve into the
// hash; a thing it can't find is a miss; find what's needed → successful, come up short →
// failed. HONEST: each "found" is a real PRESENT slot (real quote → real hash), each miss is
// a real ABSENT slot, the ending is the figure's real `outcome`. The roaming is the
// interpretive layer; the findings + verdict are literal. Look from Liz's CSS reference
// (blueprint grid + brushed-metal numerals). Sandbox data; merges onto the real PDF next.

interface Target {
  human: string;            // "diffusion term · x"
  present: boolean;
  value?: string;
  quote?: string;
  page?: number;
  pos: { x: number; y: number }; // % within the page area — deterministic scatter
}

function targetsFromExtraction(ext: FigureExtraction): Target[] {
  const raw: { human: string; slot: Slot }[] = [
    ...ext.variables.flatMap((v) => [
      { human: `variable ${v.symbol} · meaning`, slot: v.meaning },
      { human: `initial condition · ${v.symbol}`, slot: v.initialValue },
    ]),
    ...ext.parameters.flatMap((p) => [
      { human: `parameter ${p.symbol} · value`, slot: p.value },
      { human: `parameter ${p.symbol} · meaning`, slot: p.meaning },
      { human: `units · ${p.symbol}`, slot: p.units },
    ]),
    ...ext.driftTerms.map((d) => ({ human: `drift term · ${d.variable}`, slot: d.expression })),
    ...ext.diffusionTerms.map((d) => ({ human: `diffusion term · ${d.variable}`, slot: d.expression })),
    { human: "time · initial", slot: ext.timeSpan.initialTime },
    { human: "time · final", slot: ext.timeSpan.finalTime },
  ];
  return raw.map((r, i) => ({
    human: r.human,
    present: r.slot.status === "present",
    value: r.slot.status === "present" ? r.slot.value : undefined,
    quote: r.slot.status === "present" ? r.slot.quote : undefined,
    page: r.slot.status === "present" ? r.slot.page : undefined,
    // deterministic "up here / down there" scatter (no Math.random — keeps replays stable)
    pos: { x: 10 + ((i * 37) % 78), y: 12 + ((i * 53) % 70) },
  }));
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const metallic: CSSProperties = {
  backgroundImage: "linear-gradient(hsl(0 0% 92%), hsl(0 0% 45%))",
  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
};
const grid: CSSProperties = {
  ["--line" as string]: "hsl(0 0% 95% / 0.16)",
  backgroundImage:
    "linear-gradient(90deg, var(--line) 1px, transparent 1px), linear-gradient(var(--line) 1px, transparent 1px)",
  backgroundSize: "40px 40px",
  WebkitMaskImage: "linear-gradient(-15deg, transparent 25%, white)",
  maskImage: "linear-gradient(-15deg, transparent 25%, white)",
};

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FingerprintJourney({ ext }: { ext: FigureExtraction }) {
  const targets = useMemo(() => targetsFromExtraction(ext), [ext]);
  const [hashes, setHashes] = useState<(string | null)[]>([]);
  const [fingerprint, setFingerprint] = useState<string>("");
  const [step, setStep] = useState(0); // how many targets the scan has resolved

  // real per-quote hashes for the present targets, folded (in order) into one fingerprint
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hs: (string | null)[] = []; let acc = "";
      for (const t of targets) {
        if (t.present && t.quote) { const h = await sha256Hex(t.quote); acc = await sha256Hex(acc + h); hs.push(h); }
        else hs.push(null);
      }
      if (!cancelled) { setHashes(hs); setFingerprint(acc); }
    })();
    return () => { cancelled = true; };
  }, [targets]);

  // the quest auto-plays: the scan visits one target at a time. reduced-motion → resolve all.
  useEffect(() => {
    if (hashes.length === 0) return;
    if (prefersReducedMotion()) { setStep(targets.length); return; }
    setStep(0);
    const id = setInterval(() => setStep((s) => { if (s >= targets.length) { clearInterval(id); return s; } return s + 1; }), 650);
    return () => clearInterval(id);
  }, [hashes.length, targets.length]);

  const found = targets.slice(0, step).filter((t) => t.present).length;
  const missed = targets.slice(0, step).filter((t) => !t.present).length;
  const complete = step >= targets.length && targets.length > 0;
  const last = step > 0 ? targets[step - 1] : null;
  const active = targets[Math.min(step, targets.length - 1)];
  const runningFp = complete ? fingerprint : ""; // the full chain reveals on completion

  // the live caption — the "Aha!" beat
  const caption = !last
    ? "scanning the page…"
    : last.present ? `✦ ${last.human} located` : `${last.human} — not found`;

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* the page — the scan roams it hunting for what the figure needs */}
      <div className="relative overflow-hidden rounded-2xl border border-edge bg-black" style={{ height: 520 }}>
        <div className="pointer-events-none absolute inset-0" style={grid} aria-hidden />

        {/* targets scattered on the page */}
        {targets.map((t, i) => {
          const resolved = i < step;
          const isActive = i === step - 1;
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${t.pos.x}%`, top: `${t.pos.y}%`, opacity: resolved ? 1 : 0.18, transition: "opacity 400ms" }}>
              {resolved && t.present ? (
                <div className={cx("flex flex-col items-start gap-0.5", isActive && "animate-pulse")}>
                  <span className="rounded bg-present-soft px-1.5 py-0.5 text-[10px] text-present whitespace-nowrap">{t.human}</span>
                  <span className="text-xs text-ink-dim">{t.value}</span>
                  <span className="mono text-sm tracking-tight transition-all duration-500" style={metallic}>
                    {hashes[i] ? hashes[i]!.slice(0, 18) : ""}
                  </span>
                </div>
              ) : resolved ? (
                <span className="rounded border border-invalid/50 px-1.5 py-0.5 text-[10px] text-invalid whitespace-nowrap">✕ {t.human}</span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-ink-faint block" />
              )}
            </div>
          );
        })}

        {/* the scan reticle — travels to the current target */}
        {!complete && active && (
          <div className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-active"
            style={{ left: `${active.pos.x}%`, top: `${active.pos.y}%`, transition: "left 600ms ease-in-out, top 600ms ease-in-out", boxShadow: "0 0 24px hsl(var(--color-active,200 100% 60%) / 0.4)" }}>
            <span className="absolute inset-0 m-auto h-1 w-1 rounded-full bg-active" />
          </div>
        )}

        {/* caption — the running narration / the "Aha!" */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-5 py-3">
          <span className={cx("text-sm", last?.present ? "text-present" : last ? "text-invalid" : "text-ink-faint")}>{caption}</span>
          <span className="mono text-[11px] text-ink-faint">{found} found · {missed} missed</span>
        </div>
      </div>

      {/* the fingerprint + the verdict */}
      <div className="mt-4 rounded-xl border border-edge bg-inset p-4">
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          <span>extraction fingerprint</span>
          <span className="mono">{step}/{targets.length}</span>
        </div>
        <div className="mono break-all text-xl font-semibold tracking-tight transition-all duration-700"
          style={{ ...metallic, opacity: runningFp ? 1 : 0.25, filter: runningFp ? "blur(0)" : "blur(4px)" }}>
          {runningFp || "—".repeat(20)}
        </div>
        {complete && (
          <div className="mt-3 flex items-center gap-3">
            <span className={cx("rounded-full px-3 py-1 text-sm font-medium",
              ext.outcome === "successful" ? "bg-present-soft text-present" : "bg-attention-soft text-attention")}>
              {ext.outcome === "successful" ? "✓ successful — the figure could be reproduced" : "✕ failed — the figure could not be reproduced"}
            </span>
            <span className="text-xs text-ink-faint">{found} of {targets.length} located · {missed} absent</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-ink-faint">
          A dramatized replay of the real extraction — each <span className="text-present">find</span> is a present value
          (real quote → real hash), each <span className="text-invalid">miss</span> a real absence, the verdict the figure’s real outcome.
        </p>
        <button type="button" onClick={() => setStep(0)}
          className="shrink-0 rounded-full border border-edge px-3 py-1 text-[11px] text-ink-dim hover:text-ink">replay</button>
      </div>
    </div>
  );
}
