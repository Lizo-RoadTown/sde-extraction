import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { Card, Badge, cx } from "../ui";
import { signedPdfUrl } from "../data";

// pdf.js worker — Vite resolves this URL at build time (react-pdf 10 / pdfjs-dist 5).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// PDF source: a real signed URL (from storage_path) or a direct pdfUrl. "#" / "" => no PDF yet.
function isRenderable(url: string | null): url is string {
  return Boolean(url && url !== "#");
}

/**
 * The verifier's source pane. Renders the actual paper PDF and jumps to the page a
 * slot was quoted from (page-level today; exact-span highlight lands when the engine
 * emits character offsets — see docs/UX_CONTRACT.md). Falls back gracefully when no
 * PDF is available (mock mode / pdfUrl unset).
 */
export function PdfPane({
  pdfUrl,
  storagePath,
  targetPage,
  quote,
}: {
  pdfUrl: string;
  storagePath?: string;
  targetPage?: number;
  quote?: string;
}) {
  const [src, setSrc] = useState<string | null>(isRenderable(pdfUrl) ? pdfUrl : null);
  const [numPages, setNumPages] = useState<number>();
  const [page, setPage] = useState<number>(targetPage ?? 1);
  const [err, setErr] = useState<string>();

  // Jump to the page a newly-focused slot was quoted from. React's "adjust state on prop
  // change" pattern: update during render (no effect), guarded by the previous value.
  const [prevTarget, setPrevTarget] = useState(targetPage);
  if (targetPage !== prevTarget) {
    setPrevTarget(targetPage);
    if (targetPage) setPage(targetPage);
  }

  // Prefer a freshly-signed URL from the storage path when available.
  useEffect(() => {
    let live = true;
    if (storagePath) {
      signedPdfUrl(storagePath).then((u) => { if (live && u) setSrc(u); });
    }
    return () => { live = false; };
  }, [storagePath]);

  if (!isRenderable(src)) {
    return (
      <Card className="flex h-80 flex-col items-center justify-center gap-2 border-dashed text-center text-xs text-ink-faint">
        <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">no PDF yet</span>
        <div>Source PDF appears here once the paper is uploaded.</div>
        {quote && <div className="mono mt-1 max-w-xs text-ink-dim">“{quote}”{targetPage ? ` · p.${targetPage}` : ""}</div>}
      </Card>
    );
  }

  return (
    <Card className="flex h-80 flex-col gap-2 p-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="rounded bg-surface-raised px-2 py-0.5 text-xs text-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">‹</button>
          <span className="mono text-xs text-ink-dim">p.{page}{numPages ? ` / ${numPages}` : ""}</span>
          <button type="button" onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))} disabled={!!numPages && page >= numPages}
            className="rounded bg-surface-raised px-2 py-0.5 text-xs text-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">›</button>
        </div>
        {targetPage && (
          <button type="button" onClick={() => setPage(targetPage)}
            className={cx("rounded px-2 py-0.5 text-xs", page === targetPage ? "bg-active-soft text-active" : "bg-surface-raised text-ink-dim hover:text-ink")}>
            jump to source p.{targetPage}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded bg-surface-raised/40">
        {err ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-invalid" role="alert">{err}</div>
        ) : (
          <Document
            file={src}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={(e) => setErr(`Could not load PDF: ${e.message}`)}
            loading={<div className="flex h-full items-center justify-center text-xs text-ink-faint">loading PDF…</div>}
          >
            <Page pageNumber={page} width={420} renderTextLayer renderAnnotationLayer={false} />
          </Document>
        )}
      </div>
      {quote && (
        <div className="mono shrink-0 truncate px-1 text-[11px] text-ink-dim">
          <Badge tone="cyan">quoted</Badge> “{quote}”
        </div>
      )}
    </Card>
  );
}
