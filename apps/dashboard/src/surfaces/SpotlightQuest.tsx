import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { cx } from "../ui";
import { signedPdfUrl } from "../data";
import { FingerprintJourney } from "./FingerprintJourney";
import type { FigureExtraction } from "../types";

// The extraction replayed as a cinematic SEARCH over the real PDF. The page darkens + blurs;
// a small spotlight glides to each value's REAL position (slot.rect, from the locator hook)
// across ALL the pages the values live on, highlighting each term where it actually is; the
// found values populate a panel BESIDE the page as it runs. Honest: the lens only lands where
// the locator found the quote; values it couldn't locate are shown in the panel, not faked on
// the page. Positions appear after a re-run with the locator-enabled worker.

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const WIDTH = 520;
const R = 76;     // lens radius (px) — small, hones in
const CORE = 36;  // sharp core before the feather
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
interface Find { human: string; value: string; quote: string; page: number; rect?: Rect }

function findsFromExtraction(ext: FigureExtraction): Find[] {
  const fs: Find[] = [];
  const add = (human: string, s: FigureExtraction["variables"][number]["meaning"]) => {
    if (s.status === "present") fs.push({ human, value: s.value, quote: s.quote, page: s.page, rect: s.rect });
  };
  ext.variables.forEach((v) => { add(`variable ${v.symbol} · meaning`, v.meaning); add(`initial condition · ${v.symbol}`, v.initialValue); });
  ext.parameters.forEach((p) => { add(`parameter ${p.symbol} · value`, p.value); add(`parameter ${p.symbol} · meaning`, p.meaning); add(`units · ${p.symbol}`, p.units); });
  ext.driftTerms.forEach((d) => add(`drift term · ${d.variable}`, d.expression));
  ext.diffusionTerms.forEach((d) => add(`diffusion term · ${d.variable}`, d.expression));
  add("time · initial", ext.timeSpan.initialTime);
  add("time · final", ext.timeSpan.finalTime);
  // document order: by page, then by vertical position when we know it
  return fs.sort((a, b) => a.page - b.page || ((a.rect?.y ?? 0) - (b.rect?.y ?? 0)));
}
function countMisses(ext: FigureExtraction): number {
  let n = 0; const c = (s: FigureExtraction["variables"][number]["meaning"]) => { if (s.status === "absent") n++; };
  ext.variables.forEach((v) => { c(v.meaning); c(v.initialValue); });
  ext.parameters.forEach((p) => { c(p.value); c(p.meaning); c(p.units); });
  ext.driftTerms.forEach((d) => c(d.expression)); ext.diffusionTerms.forEach((d) => c(d.expression));
  c(ext.timeSpan.initialTime); c(ext.timeSpan.finalTime); return n;
}
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const center = (r: Rect): Pt => ({ x: (r.x + r.w / 2) * 100, y: (r.y + r.h / 2) * 100 });
const metallic: CSSProperties = {
  backgroundImage: "linear-gradient(hsl(0 0% 96%), hsl(0 0% 55%))",
  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
};
const maskFor = (p: Pt) => `radial-gradient(circle ${R}px at ${p.x}% ${p.y}%, transparent 0, transparent ${CORE}px, rgba(0,0,0,0.95) ${R}px)`;
function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SpotlightQuest({ ext }: { ext: FigureExtraction }) {
  const finds = useMemo(() => findsFromExtraction(ext), [ext]);
  const misses = useMemo(() => countMisses(ext), [ext]);
  const [src, setSrc] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let live = true;
    if (ext.storagePath) signedPdfUrl(ext.storagePath).then((u) => { if (live) { setSrc(u); setResolved(true); } });
    else setResolved(true);
    return () => { live = false; };
  }, [ext.storagePath]);

  const [hashes, setHashes] = useState<Map<string, string>>(new Map());
  const [fingerprint, setFingerprint] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map<string, string>(); let acc = "";
      for (const f of finds) { const h = await sha256Hex(f.quote); map.set(f.quote, h); acc = await sha256Hex(acc + h); }
      if (!cancelled) { setHashes(map); setFingerprint(acc); }
    })();
    return () => { cancelled = true; };
  }, [finds]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const spot = useRef<Pt>({ x: 50, y: 40 });
  const target = useRef<Pt>({ x: 50, y: 40 });

  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [page, setPage] = useState(1);

  const cur: Find | undefined = finds[Math.min(step, Math.max(finds.length - 1, 0))];

  // the lens glides smoothly toward the current target (refs only — no per-frame re-render)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = spot.current, t = target.current;
      s.x += (t.x - s.x) * 0.14; s.y += (t.y - s.y) * 0.14;
      if (overlayRef.current) { const m = maskFor(s); overlayRef.current.style.maskImage = m; overlayRef.current.style.webkitMaskImage = m; }
      if (lensRef.current) { lensRef.current.style.left = `${s.x}%`; lensRef.current.style.top = `${s.y}%`; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // walk the finds across ALL their pages: flip page, aim the lens at the real rect, reveal, advance
  useEffect(() => {
    if (!src || finds.length === 0 || done) return;
    if (prefersReducedMotion()) { setStep(finds.length); setDone(true); return; }
    const f = finds[step];
    if (!f) { setDone(true); return; }
    setPage(f.page);
    setRevealed(false);
    if (f.rect) target.current = center(f.rect); // only aim where we truly located it
    const t1 = window.setTimeout(() => setRevealed(true), f.rect ? 800 : 450);
    const t2 = window.setTimeout(() => { if (step + 1 >= finds.length) setDone(true); else setStep(step + 1); }, 1900);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [step, src, finds.length, done]);

  function skip() { setStep(finds.length); setDone(true); }
  function replay() { setDone(false); setRevealed(false); setStep(0); }

  if (resolved && !src) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-ink-faint">No source PDF for this extraction — showing the journey on an abstract page.</div>
        <FingerprintJourney ext={ext} />
      </div>
    );
  }
  if (!resolved) return <div className="rounded-xl border border-edge bg-inset p-6 text-center text-xs text-ink-faint">loading source…</div>;

  const found = Math.min(step + (revealed ? 1 : 0), finds.length);
  const caption = done ? "search complete"
    : cur ? (revealed ? `✦ ${cur.human} located` : `searching p.${page} for ${cur.human}…`) : `p.${page}`;
  const gotIdx = (i: number) => done || i < step || (i === step && revealed);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {/* the page being searched (flips across pages) */}
        <div className="relative shrink-0 overflow-hidden rounded-xl border border-edge bg-black" style={{ width: WIDTH, maxWidth: "100%" }}>
          <Document file={src} loading={<div className="flex h-96 items-center justify-center text-xs text-ink-faint">loading PDF…</div>}>
            <Page pageNumber={page} width={WIDTH} renderTextLayer={false} renderAnnotationLayer={false}
              loading={<div className="flex h-96 items-center justify-center text-xs text-ink-faint">rendering p.{page}…</div>} />
            {!done && (
              <div ref={overlayRef} className="pointer-events-none absolute inset-0"
                style={{ filter: "blur(5px) brightness(0.4)", maskImage: maskFor(spot.current), WebkitMaskImage: maskFor(spot.current), willChange: "mask" }}>
                <Page pageNumber={page} width={WIDTH} renderTextLayer={false} renderAnnotationLayer={false} loading={<div className="h-96" />} />
              </div>
            )}
          </Document>

          {/* highlight box exactly over the located term */}
          {!done && revealed && cur?.rect && (
            <div className="pointer-events-none absolute z-10 rounded-sm border border-active/80 bg-active/15"
              style={{ left: `${cur.rect.x * 100}%`, top: `${cur.rect.y * 100}%`, width: `${cur.rect.w * 100}%`, height: `${cur.rect.h * 100}%` }} />
          )}
          {/* the magnifier lens ring */}
          {!done && (
            <div ref={lensRef} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-active/50"
              style={{ left: "50%", top: "40%", height: R * 2, width: R * 2, boxShadow: "0 0 46px hsl(200 100% 60% / 0.22), inset 0 0 34px hsl(200 100% 60% / 0.10)" }} />
          )}

          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-gradient-to-t from-black/95 to-transparent px-3 py-2">
            <span className={cx("text-xs", revealed ? "text-present" : "text-ink-faint")}>{caption}</span>
            <div className="flex items-center gap-2">
              <span className="mono text-[10px] text-ink-faint">p.{page} · {found}/{finds.length}</span>
              {!done ? <button type="button" onClick={skip} className="rounded-full border border-edge px-2 py-0.5 text-[10px] text-ink-dim hover:text-ink">skip</button>
                     : <button type="button" onClick={replay} className="rounded-full border border-edge px-2 py-0.5 text-[10px] text-ink-dim hover:text-ink">replay</button>}
            </div>
          </div>
        </div>

        {/* the values populate BESIDE the page as the search lands on them */}
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1 rounded-xl border border-edge bg-inset p-3">
          <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-ink-faint">
            <span>collected</span><span className="mono">{found}/{finds.length}</span>
          </div>
          <div className="flex max-h-[460px] flex-col gap-1 overflow-auto">
            {finds.map((f, i) => {
              const got = gotIdx(i);
              return (
                <div key={i} className={cx("rounded border px-2 py-1 transition-all duration-500",
                  i === step && !done ? "border-active-edge bg-active-soft/40" : "border-edge/50",
                  got ? "opacity-100" : "opacity-45")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-ink-dim" title={f.human}>{f.human}</span>
                    <span className="shrink-0 text-[10px] text-ink-faint">p.{f.page}{f.rect ? "" : " ·?"}</span>
                  </div>
                  <div className="truncate text-xs text-ink" title={f.value}>{f.value}</div>
                  <div className={cx("mono truncate text-[11px] transition-all duration-500", got ? "blur-0" : "blur-[4px]")} style={metallic}>
                    {(hashes.get(f.quote) ?? "").slice(0, 16) || "…"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* the fingerprint + verdict */}
      <div className="rounded-xl border border-edge bg-inset p-4">
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          <span>extraction fingerprint</span><span className="mono">{finds.length} found · {misses} absent</span>
        </div>
        <div className="mono break-all text-lg font-semibold tracking-tight transition-all duration-700"
          style={{ ...metallic, opacity: done ? 1 : 0.25, filter: done ? "blur(0)" : "blur(4px)" }}>
          {done ? fingerprint : "—".repeat(20)}
        </div>
        {done && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={cx("rounded-full px-3 py-1 text-sm font-medium",
              ext.outcome === "successful" ? "bg-present-soft text-present" : "bg-attention-soft text-attention")}>
              {ext.outcome === "successful" ? "✓ successful — the figure could be reproduced" : "✕ failed — the figure could not be reproduced"}
            </span>
            <span className="text-xs text-ink-faint">{finds.length} located · {misses} absent</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-faint">
        A searchlight replay over the real PDF — the lens lands only where the locator found the quote (real position →
        real hash); a <span className="mono">·?</span> means that value couldn’t be pinpointed (shown here, never faked on the page).
      </p>
    </div>
  );
}
