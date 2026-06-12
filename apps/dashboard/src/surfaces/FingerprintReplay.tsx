import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Badge, cx } from "../ui";
import type { FigureExtraction, Slot } from "../types";

// "Watch the fingerprint form" — observability-spine Feature 1, Version A (replay).
// The per-piece hashes already exist: each present slot's SHA-256 is just the hash of its
// verbatim quote (matching the engine's checksums_for). We RE-DERIVE them here in the
// browser — so the user can verify every piece themselves (research principle: trust comes
// from re-derivability, not badges) — and fold them, in document order, into a running
// chain: the extraction fingerprint. Honest about what it is: a replay, post-hoc, over the
// real quotes; the chain is the fingerprint of WHAT WAS EXTRACTED, distinct from the file
// hash. Paced as a journey, reduced-motion aware, on-demand (not autoplay theater).

export interface Piece { label: string; value: string; quote: string; page: number; }

/** Present slots, in document order (by page), as the pieces that fold into the fingerprint. */
export function piecesFromExtraction(ext: FigureExtraction): Piece[] {
  const out: Piece[] = [];
  const push = (label: string, slot: Slot) => {
    if (slot.status === "present") out.push({ label, value: slot.value, quote: slot.quote, page: slot.page });
  };
  ext.variables.forEach((v) => { push(`${v.symbol} · meaning`, v.meaning); push(`${v.symbol} · initial value`, v.initialValue); });
  ext.parameters.forEach((p) => { push(`${p.symbol} · value`, p.value); push(`${p.symbol} · meaning`, p.meaning); push(`${p.symbol} · units`, p.units); });
  ext.driftTerms.forEach((d) => push(`drift ${d.variable}`, d.expression));
  ext.diffusionTerms.forEach((d) => push(`diff ${d.variable}`, d.expression));
  push("time · initial", ext.timeSpan.initialTime);
  push("time · final", ext.timeSpan.finalTime);
  return out.sort((a, b) => a.page - b.page); // stable → document order
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FingerprintReplay({ ext }: { ext: FigureExtraction }) {
  const pieces = useMemo(() => piecesFromExtraction(ext), [ext]);
  const [open, setOpen] = useState(false);

  // Precompute each piece's hash and the running chain once — stepping is then instant + smooth.
  // chain[i] = sha256(chain[i-1] + pieceHash[i]); chain[-1] = "" (the empty seed).
  const [hashes, setHashes] = useState<string[]>([]);
  const [chain, setChain] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hs: string[] = [];
      const ch: string[] = [];
      let acc = "";
      for (const p of pieces) {
        const h = await sha256Hex(p.quote);
        acc = await sha256Hex(acc + h);
        hs.push(h); ch.push(acc);
      }
      if (!cancelled) { setHashes(hs); setChain(ch); }
    })();
    return () => { cancelled = true; };
  }, [pieces]);

  // step = how many pieces have been folded (0..N). The "current" piece is index step-1.
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  // advance while playing; ~420ms/piece (a journey, not a flicker). reduced-motion = no autoplay.
  useEffect(() => {
    if (!playing) return;
    if (step >= pieces.length) { setPlaying(false); return; }
    timer.current = window.setTimeout(() => setStep((s) => Math.min(s + 1, pieces.length)), 420);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [playing, step, pieces.length]);

  function play() {
    if (prefersReducedMotion()) { setStep(pieces.length); return; } // instant, no motion
    if (step >= pieces.length) setStep(0);
    setPlaying(true);
  }

  const ready = chain.length === pieces.length && pieces.length > 0;
  const current = step > 0 ? pieces[step - 1] : null;
  const currentHash = step > 0 ? hashes[step - 1] : null;
  const fingerprint = ready ? chain[step - 1] ?? null : null;
  const complete = step === pieces.length && pieces.length > 0;

  if (pieces.length === 0) return null; // nothing present → nothing to fold

  return (
    <Card className="flex flex-col gap-3">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
        <span className="text-sm font-medium text-ink">{open ? "▾" : "▸"} Watch the fingerprint form</span>
        <span className="text-[11px] text-ink-faint">{pieces.length} quoted spans · SHA-256</span>
      </button>

      {open && (
        <>
          {/* the running fingerprint — the chain over every folded quote-hash */}
          <div className="rounded-md bg-inset px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">extraction fingerprint</span>
              {complete ? <Badge tone="green">complete</Badge>
                : <span className="text-[11px] text-ink-faint">{step}/{pieces.length} folded</span>}
            </div>
            <div className="mono break-all text-xs text-active">
              {fingerprint ?? <span className="text-ink-faint">— press play to fold each quoted span into the fingerprint —</span>}
            </div>
          </div>

          {/* the current piece: its quote, and the hash derived from it */}
          <div className={cx("rounded-md border border-edge px-3 py-2 transition", current ? "opacity-100" : "opacity-60")}>
            {current ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs text-active">{current.label}</span>
                  <Badge tone="slate">p.{current.page}</Badge>
                </div>
                <div className="text-sm text-ink">{current.value}</div>
                <div className="text-xs italic text-ink-dim">“{current.quote}”</div>
                <div className="mono break-all text-[11px] text-present">sha256 = {currentHash}</div>
              </div>
            ) : (
              <div className="py-2 text-center text-xs text-ink-faint">each present value was quoted verbatim from the paper — its hash is the SHA-256 of that quote</div>
            )}
          </div>

          {/* controls: play/pause + step + scrubber */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => (playing ? setPlaying(false) : play())} disabled={!ready}
              className="rounded-md bg-active-soft px-3 py-1.5 text-sm text-active transition hover:brightness-110 disabled:opacity-50">
              {playing ? "pause" : complete ? "replay" : "play"}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={!ready || step === 0}
              className="rounded px-2 py-1 text-xs text-ink-dim hover:text-ink disabled:opacity-40">‹ back</button>
            <input type="range" min={0} max={pieces.length} value={step} disabled={!ready}
              onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
              aria-label="fingerprint replay position" className="flex-1 accent-[var(--color-active,currentColor)]" />
            <button type="button" onClick={() => { setPlaying(false); setStep((s) => Math.min(pieces.length, s + 1)); }} disabled={!ready || complete}
              className="rounded px-2 py-1 text-xs text-ink-dim hover:text-ink disabled:opacity-40">next ›</button>
          </div>

          {/* the folded pieces, ticking off as the journey proceeds */}
          <div className="flex flex-wrap gap-1">
            {pieces.map((p, i) => (
              <button type="button" key={i} onClick={() => { setPlaying(false); setStep(i + 1); }}
                title={`${p.label} · p.${p.page}`}
                className={cx("rounded px-1.5 py-0.5 text-[10px] mono transition",
                  i < step ? "bg-present-soft text-present" : i === step ? "bg-active-soft text-active" : "bg-surface-raised text-ink-faint hover:text-ink")}>
                {p.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-ink-faint">
            A replay over the real quoted spans (post-hoc, not live). Each hash is the SHA-256 of that exact
            quote — verify any one yourself. The fingerprint is the chain over every span: the fingerprint of
            <span className="text-ink-dim"> what was extracted</span>, distinct from the PDF’s file hash.
          </p>
        </>
      )}
    </Card>
  );
}
