import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { cx } from "../ui";
import { signedPdfUrl } from "../data";
import { FingerprintJourney } from "./FingerprintJourney";
import type { FigureExtraction } from "../types";

// The extraction dramatized as a search quest over the REAL PDF (the on-page version of
// FingerprintJourney, tied to real data). For each PRESENT value the scan flips to its page,
// finds the verbatim quote in the pdf.js text layer to get its REAL position, lands there,
// 'Aha! located!', and resolves the blurred numbers into the quote's SHA-256 — folding each
// into the running fingerprint. Absent slots are real misses. The verdict is the figure's
// real `outcome`. Honest: positions/quotes/hashes/verdict are literal; the roaming is the
// interpretive layer. Falls back to the stylized journey when there's no PDF, and to a
// side-panel reveal when a quote can't be pinpointed on the page.

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Find { human: string; value: string; quote: string; page: number; }

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
  return fs.sort((a, b) => a.page - b.page);
}

function missesFromExtraction(ext: FigureExtraction): string[] {
  const ms: string[] = [];
  const chk = (human: string, s: FigureExtraction["variables"][number]["meaning"]) => { if (s.status === "absent") ms.push(human); };
  ext.variables.forEach((v) => { chk(`variable ${v.symbol} · meaning`, v.meaning); chk(`initial condition · ${v.symbol}`, v.initialValue); });
  ext.parameters.forEach((p) => { chk(`parameter ${p.symbol} · value`, p.value); chk(`parameter ${p.symbol} · meaning`, p.meaning); chk(`units · ${p.symbol}`, p.units); });
  ext.driftTerms.forEach((d) => chk(`drift term · ${d.variable}`, d.expression));
  ext.diffusionTerms.forEach((d) => chk(`diffusion term · ${d.variable}`, d.expression));
  chk("time · initial", ext.timeSpan.initialTime);
  chk("time · final", ext.timeSpan.finalTime);
  return ms;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Locate a quote's real position (% within the page container) via the rendered text layer.
function locate(container: HTMLElement, quote: string): { x: number; y: number } | null {
  const spans = Array.from(container.querySelectorAll<HTMLSpanElement>(".react-pdf__Page__textContent span"));
  if (spans.length === 0) return null;
  const needle = norm(quote);
  if (!needle) return null;
  let concat = ""; const ranges: { s: HTMLSpanElement; start: number; end: number }[] = [];
  for (const s of spans) { const t = norm(s.textContent || ""); ranges.push({ s, start: concat.length, end: concat.length + t.length }); concat += t + " "; }
  const probe = needle.slice(0, 14);
  let target: HTMLSpanElement | null = null;
  const at = concat.indexOf(probe);
  if (at >= 0) target = ranges.find((r) => at >= r.start && at < r.end)?.s ?? null;
  if (!target) { const w = needle.split(" ")[0]; target = spans.find((s) => norm(s.textContent || "").includes(w) && w.length > 2) ?? null; }
  if (!target) return null;
  const cr = container.getBoundingClientRect(); const r = target.getBoundingClientRect();
  return { x: ((r.left + r.width / 2 - cr.left) / cr.width) * 100, y: ((r.top + r.height / 2 - cr.top) / cr.height) * 100 };
}

const metallic: CSSProperties = {
  backgroundImage: "linear-gradient(hsl(0 0% 92%), hsl(0 0% 45%))",
  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
};

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PdfQuest({ ext }: { ext: FigureExtraction }) {
  const finds = useMemo(() => findsFromExtraction(ext), [ext]);
  const misses = useMemo(() => missesFromExtraction(ext), [ext]);
  const [src, setSrc] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false); // tried to get a signed URL yet?

  useEffect(() => {
    let live = true;
    if (ext.storagePath) signedPdfUrl(ext.storagePath).then((u) => { if (live) { setSrc(u); setResolved(true); } });
    else setResolved(true);
    return () => { live = false; };
  }, [ext.storagePath]);

  // hashes + folded fingerprint (over the finds, in page order)
  const [hashes, setHashes] = useState<string[]>([]);
  const [fingerprint, setFingerprint] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hs: string[] = []; let acc = "";
      for (const f of finds) { const h = await sha256Hex(f.quote); acc = await sha256Hex(acc + h); hs.push(h); }
      if (!cancelled) { setHashes(hs); setFingerprint(acc); }
    })();
    return () => { cancelled = true; };
  }, [finds]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);                 // current find
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);

  const page = finds[idx]?.page ?? 1;
  const complete = idx >= finds.length;

  // drive the quest: for each find, allow the page to render, locate the quote, reveal, advance
  useEffect(() => {
    if (!src || finds.length === 0 || complete) return;
    if (prefersReducedMotion()) { setIdx(finds.length); return; }
    setPos(null); setRevealed(false);
    const t1 = window.setTimeout(() => {
      const c = containerRef.current;
      setPos(c ? locate(c, finds[idx].quote) : null);
      setRevealed(true);
    }, 650);
    const t2 = window.setTimeout(() => setIdx((i) => i + 1), 1900);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, src, finds.length]);

  // no real PDF → the stylized journey (still real data, just an abstract page)
  if (resolved && !src) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-ink-faint">No source PDF for this extraction — showing the journey on an abstract page.</div>
        <FingerprintJourney ext={ext} />
      </div>
    );
  }
  if (!resolved) return <div className="rounded-xl border border-edge bg-inset p-6 text-center text-xs text-ink-faint">loading source…</div>;

  const current = finds[idx];
  const caption = complete ? "quest complete"
    : revealed ? `✦ ${current?.human} located` : `searching p.${page} for ${current?.human}…`;
  const found = Math.min(idx + (revealed ? 1 : 0), finds.length);

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative overflow-hidden rounded-xl border border-edge bg-black">
        <Document file={src} loading={<div className="flex h-96 items-center justify-center text-xs text-ink-faint">loading PDF…</div>}>
          <Page pageNumber={page} width={620} renderTextLayer renderAnnotationLayer={false}
            loading={<div className="flex h-96 items-center justify-center text-xs text-ink-faint">rendering p.{page}…</div>} />
        </Document>

        {/* scan reticle at the located quote */}
        {!complete && pos && (
          <div className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-active"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transition: "left 500ms ease-in-out, top 500ms ease-in-out", boxShadow: "0 0 26px hsl(200 100% 60% / 0.5)" }}>
            <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-active" />
          </div>
        )}

        {/* the find's hash, revealed at its location (or pinned top-left if not pinpointed) */}
        {!complete && revealed && current && (
          <div className="pointer-events-none absolute max-w-[60%] -translate-y-full rounded bg-black/80 px-2 py-1"
            style={pos ? { left: `${pos.x}%`, top: `${pos.y}%` } : { left: "2%", top: "8%" }}>
            <div className="text-[10px] text-present whitespace-nowrap">✦ {current.human}</div>
            <div className="text-[11px] text-ink-dim">{current.value}</div>
            <div className="mono text-xs tracking-tight" style={metallic}>{hashes[idx]?.slice(0, 20) ?? ""}</div>
          </div>
        )}

        {/* caption */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-4 py-2">
          <span className={cx("text-sm", revealed ? "text-present" : "text-ink-faint")}>{caption}</span>
          <span className="mono text-[11px] text-ink-faint">{found}/{finds.length} found · {misses.length} absent</span>
        </div>
      </div>

      {/* the fingerprint + verdict */}
      <div className="rounded-xl border border-edge bg-inset p-4">
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          <span>extraction fingerprint</span><span className="mono">{found}/{finds.length}</span>
        </div>
        <div className="mono break-all text-lg font-semibold tracking-tight transition-all duration-700"
          style={{ ...metallic, opacity: complete ? 1 : 0.25, filter: complete ? "blur(0)" : "blur(4px)" }}>
          {complete ? fingerprint : "—".repeat(20)}
        </div>
        {complete && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={cx("rounded-full px-3 py-1 text-sm font-medium",
              ext.outcome === "successful" ? "bg-present-soft text-present" : "bg-attention-soft text-attention")}>
              {ext.outcome === "successful" ? "✓ successful — the figure could be reproduced" : "✕ failed — the figure could not be reproduced"}
            </span>
            <span className="text-xs text-ink-faint">{finds.length} located · {misses.length} absent</span>
            <button type="button" onClick={() => setIdx(0)} className="ml-auto rounded-full border border-edge px-3 py-1 text-[11px] text-ink-dim hover:text-ink">replay</button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-faint">
        A dramatized replay over the real PDF — each <span className="text-present">find</span> is a present value located by its
        verbatim quote (real quote → real hash); each <span className="text-invalid">absence</span> a real miss; the verdict the figure’s real outcome.
      </p>
    </div>
  );
}
