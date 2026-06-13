import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cx } from "../ui";
import { signedPdfUrl } from "../data";
import { FingerprintJourney } from "./FingerprintJourney";
import type { FigureExtraction } from "../types";

// The extraction replayed as a cinematic SEARCH over the real PDF (proposal:
// docs/proposals/2026-06-12-spotlight-search-animation-stack.md). The page darkens + blurs;
// a soft spotlight glides across it (GSAP), landing on each value the figure required at its
// REAL text-layer position, where its SHA-256 resolves; the chain is the extraction fingerprint.
// Architecture: a sharp <Page> (L0) under a blurred+darkened copy (L2) whose radial `mask` is
// cut away under the lens — only the MASK center animates (blur is baked once; never animate
// backdrop-filter). Honest: a replay of a real run; the lens lands only on real finds.

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const WIDTH = 620;
const R = 150;       // lens radius (px) — soft falloff out to here
const CORE = 88;     // sharp/bright core before the feather begins
type Pt = { x: number; y: number };
interface Find { human: string; value: string; quote: string; page: number }

function findsFromExtraction(ext: FigureExtraction): Find[] {
  const fs: Find[] = [];
  const add = (human: string, s: FigureExtraction["variables"][number]["meaning"]) => {
    if (s.status === "present") fs.push({ human, value: s.value, quote: s.quote, page: s.page });
  };
  ext.variables.forEach((v) => { add(`variable ${v.symbol} · meaning`, v.meaning); add(`initial condition · ${v.symbol}`, v.initialValue); });
  ext.parameters.forEach((p) => { add(`parameter ${p.symbol} · value`, p.value); add(`parameter ${p.symbol} · meaning`, p.meaning); add(`units · ${p.symbol}`, p.units); });
  ext.driftTerms.forEach((d) => add(`drift term · ${d.variable}`, d.expression));
  ext.diffusionTerms.forEach((d) => add(`diffusion term · ${d.variable}`, d.expression));
  add("time · initial", ext.timeSpan.initialTime);
  add("time · final", ext.timeSpan.finalTime);
  return fs;
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
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function locate(container: HTMLElement, quote: string): Pt | null {
  const spans = Array.from(container.querySelectorAll<HTMLSpanElement>(".react-pdf__Page__textContent span"));
  if (!spans.length) return null;
  const needle = norm(quote); if (!needle) return null;
  let concat = ""; const ranges: { s: HTMLSpanElement; start: number; end: number }[] = [];
  for (const s of spans) { const t = norm(s.textContent || ""); ranges.push({ s, start: concat.length, end: concat.length + t.length }); concat += t + " "; }
  let target: HTMLSpanElement | null = null;
  const at = concat.indexOf(needle.slice(0, 14));
  if (at >= 0) target = ranges.find((r) => at >= r.start && at < r.end)?.s ?? null;
  if (!target) { const w = needle.split(" ").find((x) => x.length > 3); if (w) target = spans.find((s) => norm(s.textContent || "").includes(w)) ?? null; }
  if (!target) return null;
  const cr = container.getBoundingClientRect(), r = target.getBoundingClientRect();
  return { x: ((r.left + r.width / 2 - cr.left) / cr.width) * 100, y: ((r.top + r.height / 2 - cr.top) / cr.height) * 100 };
}

const metallic: CSSProperties = {
  backgroundImage: "linear-gradient(hsl(0 0% 96%), hsl(0 0% 55%))",
  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
};
// soft-edged spotlight: transparent core → feather → opaque (the dark layer shows where opaque)
const maskFor = (p: Pt) => `radial-gradient(circle ${R}px at ${p.x}% ${p.y}%, transparent 0, transparent ${CORE}px, rgba(0,0,0,0.96) ${R}px)`;

export function SpotlightQuest({ ext }: { ext: FigureExtraction }) {
  const finds = useMemo(() => findsFromExtraction(ext), [ext]);
  const misses = useMemo(() => countMisses(ext), [ext]);
  // stage = the page with the most finds (one cinematic page; the rail folds them all)
  const stagePage = useMemo(() => {
    const byPage = new Map<number, number>();
    finds.forEach((f) => byPage.set(f.page, (byPage.get(f.page) ?? 0) + 1));
    let best = finds[0]?.page ?? 1, n = -1;
    byPage.forEach((c, p) => { if (c > n) { n = c; best = p; } });
    return best;
  }, [finds]);
  const stageFinds = useMemo(() => finds.filter((f) => f.page === stagePage), [finds, stagePage]);

  const [src, setSrc] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let live = true;
    if (ext.storagePath) signedPdfUrl(ext.storagePath).then((u) => { if (live) { setSrc(u); setResolved(true); } });
    else setResolved(true);
    return () => { live = false; };
  }, [ext.storagePath]);

  // hashes + folded fingerprint over ALL finds (stage order first for the visible chain feel)
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

  const containerRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const [posList, setPosList] = useState<(Pt | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [revealIdx, setRevealIdx] = useState(0); // stage finds revealed
  const [done, setDone] = useState(false);

  // when the text layer is rendered, locate each stage find's real position
  function onTextReady() {
    const c = containerRef.current; if (!c) return;
    setPosList(stageFinds.map((f) => locate(c, f.quote)));
    setReady(true);
  }

  const applyLens = (p: Pt) => {
    const m = maskFor(p);
    if (maskRef.current) { maskRef.current.style.maskImage = m; maskRef.current.style.webkitMaskImage = m; }
    if (lensRef.current) { lensRef.current.style.left = `${p.x}%`; lensRef.current.style.top = `${p.y}%`; }
  };

  // build the GSAP search timeline once positions are known
  useGSAP(() => {
    if (!ready || stageFinds.length === 0) return;
    const pts = posList.map((p, i) => p ?? { x: 16 + ((i * 37) % 66), y: 16 + ((i * 53) % 62) }); // sweep point if a quote couldn't be pinpointed
    const lens = { x: 50, y: 42 };
    applyLens(lens);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({ onComplete: () => setDone(true) });
      pts.forEach((p, i) => {
        tl.to(lens, { x: p.x, y: p.y, duration: 0.7, ease: "power2.inOut", onUpdate: () => applyLens(lens) }, "+=0.05");
        tl.add(() => setRevealIdx(i + 1));
        tl.to({}, { duration: 1.2 + ((i % 3) * 0.4) }); // varied dwell so it doesn't read like a metronome
      });
      tlRef.current = tl;
      return () => tl.kill();
    });
    mm.add("(prefers-reduced-motion: reduce)", () => { setRevealIdx(stageFinds.length); setDone(true); });
    return () => mm.revert();
  }, { dependencies: [ready, stageFinds.length], scope: containerRef });

  function skip() { tlRef.current?.progress(1); setRevealIdx(stageFinds.length); setDone(true); }
  function replay() { setDone(false); setRevealIdx(0); tlRef.current?.restart(); }

  if (resolved && !src) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-ink-faint">No source PDF for this extraction — showing the journey on an abstract page.</div>
        <FingerprintJourney ext={ext} />
      </div>
    );
  }
  if (!resolved) return <div className="rounded-xl border border-edge bg-inset p-6 text-center text-xs text-ink-faint">loading source…</div>;

  const current = revealIdx > 0 ? stageFinds[revealIdx - 1] : null;
  const caption = done ? "search complete" : current ? `✦ ${current.human} located` : `searching p.${stagePage}…`;

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative overflow-hidden rounded-xl border border-edge bg-black" style={{ width: WIDTH, maxWidth: "100%" }}>
        <Document file={src} loading={<div className="flex h-96 items-center justify-center text-xs text-ink-faint">loading PDF…</div>}>
          {/* L0 — the sharp page + text layer (the honest original; source of quote rects) */}
          <Page pageNumber={stagePage} width={WIDTH} renderTextLayer renderAnnotationLayer={false} onRenderTextLayerSuccess={onTextReady}
            loading={<div className="flex h-96 items-center justify-center text-xs text-ink-faint">rendering p.{stagePage}…</div>} />
          {/* L2 — a blurred + darkened copy, masked so the lens cuts a sharp hole to L0 */}
          {!done && (
            <div ref={maskRef} className="pointer-events-none absolute inset-0"
              style={{ filter: "blur(5px) brightness(0.42)", maskImage: maskFor({ x: 50, y: 42 }), WebkitMaskImage: maskFor({ x: 50, y: 42 }), willChange: "mask" }}>
              <Page pageNumber={stagePage} width={WIDTH} renderTextLayer={false} renderAnnotationLayer={false} loading={<div className="h-96" />} />
            </div>
          )}
        </Document>

        {/* the magnifier lens ring, gliding with the light */}
        {!done && (
          <div ref={lensRef} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-active/50"
            style={{ left: "50%", top: "42%", height: R * 2, width: R * 2, boxShadow: "0 0 50px hsl(200 100% 60% / 0.22), inset 0 0 40px hsl(200 100% 60% / 0.10)" }} />
        )}

        {/* the find resolved in the light: value + its metallic hash, at the real position */}
        {!done && current && posList[revealIdx - 1] && (
          <div className="pointer-events-none absolute z-10 max-w-[60%] -translate-x-1/2 rounded bg-black/55 px-2 py-1 text-center"
            style={{ left: `${posList[revealIdx - 1]!.x}%`, top: `${Math.min(posList[revealIdx - 1]!.y + 11, 92)}%` }}>
            <div className="text-[10px] text-present whitespace-nowrap">✦ {current.human}</div>
            <div className="text-[11px] text-ink-dim">{current.value}</div>
            <div className="mono text-xs tracking-tight" style={metallic}>{(hashes.get(current.quote) ?? "").slice(0, 20)}</div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-gradient-to-t from-black/95 to-transparent px-4 py-2">
          <span className={cx("text-sm", current ? "text-present" : "text-ink-faint")}>{caption}</span>
          <div className="flex items-center gap-3">
            {!done && <button type="button" onClick={skip} className="rounded-full border border-edge px-2.5 py-0.5 text-[11px] text-ink-dim hover:text-ink">skip</button>}
            {done && <button type="button" onClick={replay} className="rounded-full border border-edge px-2.5 py-0.5 text-[11px] text-ink-dim hover:text-ink">replay</button>}
          </div>
        </div>
      </div>

      {/* the collected hashes — blurred until the search reaches each; hover to clarify */}
      <div className="flex flex-wrap gap-1.5">
        {finds.map((f, i) => {
          const got = done || (f.page === stagePage && stageFinds.indexOf(f) < revealIdx);
          return (
            <div key={i} className="group flex items-center gap-1.5 rounded border border-edge/60 px-2 py-1" title={f.human}>
              <span className="text-[10px] text-ink-faint">{f.human}</span>
              <span className={cx("mono text-xs tracking-tight transition-all duration-500 group-hover:opacity-100 group-hover:blur-0",
                got ? "opacity-100 blur-0" : "opacity-40 blur-[5px]")} style={metallic}>
                {(hashes.get(f.quote) ?? "").slice(0, 12) || "…"}
              </span>
            </div>
          );
        })}
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
        A searchlight <span className="text-ink-dim">replay</span> over the real PDF — the lens lands only on values the run actually found
        (real quote → real hash); absences are real misses; the verdict is the figure’s real outcome.
      </p>
    </div>
  );
}
