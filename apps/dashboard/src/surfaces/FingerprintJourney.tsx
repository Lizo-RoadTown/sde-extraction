import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cx } from "../ui";
import type { FigureExtraction } from "../types";
import { piecesFromExtraction } from "./FingerprintReplay";

// AESTHETIC SANDBOX (#/fingerprint) — the "numbers appearing over a blueprint grid" look
// from Liz's CSS reference (2026-06-12): a masked graph-paper grid + metallic gradient-clipped
// numerals. This validates the LOOK on its own; the on-PDF-page journey (locate each quote in
// the text layer, travel to it) merges this treatment onto the real page next.

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// brushed-metal text — Liz's `section p`: linear-gradient clipped to the glyphs
const metallic: CSSProperties = {
  backgroundImage: "linear-gradient(hsl(0 0% 92%), hsl(0 0% 45%))",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

// the graph-paper grid — Liz's `body::before`, panel-scaled (40px) with the diagonal mask fade
const grid: CSSProperties = {
  ["--line" as string]: "hsl(0 0% 95% / 0.18)",
  backgroundImage:
    "linear-gradient(90deg, var(--line) 1px, transparent 1px), linear-gradient(var(--line) 1px, transparent 1px)",
  backgroundSize: "40px 40px",
  WebkitMaskImage: "linear-gradient(-15deg, transparent 30%, white)",
  maskImage: "linear-gradient(-15deg, transparent 30%, white)",
};

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FingerprintJourney({ ext }: { ext: FigureExtraction }) {
  const pieces = useMemo(() => piecesFromExtraction(ext), [ext]);
  const [hashes, setHashes] = useState<string[]>([]);
  const [chain, setChain] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hs: string[] = []; const ch: string[] = []; let acc = "";
      for (const p of pieces) { const h = await sha256Hex(p.quote); acc = await sha256Hex(acc + h); hs.push(h); ch.push(acc); }
      if (!cancelled) { setHashes(hs); setChain(ch); }
    })();
    return () => { cancelled = true; };
  }, [pieces]);

  // auto-play the journey: reveal one piece at a time (~520ms). reduced-motion → all at once.
  useEffect(() => {
    if (hashes.length === 0) return;
    if (prefersReducedMotion()) { setStep(pieces.length); return; }
    setStep(0);
    const id = setInterval(() => setStep((s) => { if (s >= pieces.length) { clearInterval(id); return s; } return s + 1; }), 520);
    return () => clearInterval(id);
  }, [hashes.length, pieces.length]);

  const fingerprint = step > 0 ? chain[step - 1] : null;
  const complete = step >= pieces.length && pieces.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative overflow-hidden rounded-2xl border border-edge bg-black p-8" style={{ minHeight: 560 }}>
        {/* the blueprint grid */}
        <div className="pointer-events-none absolute inset-0" style={grid} aria-hidden />

        <div className="relative flex flex-col gap-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-ink-faint">extraction fingerprint</div>
              <div className="text-sm text-ink-dim">{ext.figureLabel} · {ext.pathogen}</div>
            </div>
            <button type="button" onClick={() => setStep(0)}
              className="rounded-full border border-edge px-3 py-1 text-[11px] text-ink-dim hover:text-ink">replay</button>
          </div>

          {/* the journey — each hash sits OUT OF FOCUS until attention reaches it: the
              traveling scan sharpens it as it's collected, and rolling over (hover) clarifies
              it too. Uncollected data is fuzzy; focus brings it clear. */}
          <div className="flex flex-col gap-3">
            {pieces.map((p, i) => {
              const collected = i < step;
              return (
                <div key={i} className="group flex items-baseline gap-4">
                  <span className="mono w-32 shrink-0 text-right text-[11px] text-ink-faint">{p.label}</span>
                  <span className="w-12 shrink-0 text-xs text-ink-dim">p.{p.page}</span>
                  <span
                    className={cx(
                      "mono flex-1 truncate text-lg font-medium tracking-tight transition-all duration-500 ease-out group-hover:opacity-100 group-hover:blur-0",
                      collected ? "opacity-100 blur-0" : "opacity-50 blur-[5px]",
                    )}
                    style={metallic}
                  >
                    {hashes[i] ? hashes[i].slice(0, 28) : "…"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* the accumulating fingerprint */}
          <div className="mt-2 border-t border-edge/60 pt-5">
            <div className="mb-1 flex items-center justify-between text-[11px] text-ink-faint">
              <span className="uppercase tracking-[0.2em]">{complete ? "fingerprint" : "folding…"}</span>
              <span className="mono">{step}/{pieces.length}</span>
            </div>
            <div className="mono break-all text-2xl font-semibold tracking-tight transition-all duration-500"
              style={{ ...metallic, opacity: fingerprint ? 1 : 0.3 }}>
              {fingerprint ?? "—".repeat(16)}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-faint">
        Aesthetic sandbox · the look from your CSS reference (blueprint grid + brushed-metal numerals).
        Next: ride this treatment over the located quotes on the real PDF page.
      </p>
    </div>
  );
}
