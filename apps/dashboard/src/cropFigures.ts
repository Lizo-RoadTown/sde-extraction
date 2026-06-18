import { pdfjs } from "react-pdf";
import type { DetectedFigure } from "./data";

// Render REAL figure crops for the human chooser. This does NOT detect figures — the server's
// PyMuPDF detector already found them (papers.detected_figures). This only renders each server-found
// region, cropped from the PDF to its exact bbox, so the human sees the actual figure (not a whole
// page) when choosing. bbox_norm is top-left-origin fractions of the page, matching the canvas.

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export interface FigureThumb extends DetectedFigure {
  thumb?: string; // data URL of the cropped figure (undefined if the render failed)
}

const RENDER_SCALE = 2; // 2x for a crisp crop; we clip to the region, we don't crank DPI on the page

export async function renderFigureThumbs(file: File, figures: DetectedFigure[]): Promise<FigureThumb[]> {
  const out: FigureThumb[] = figures.map((f) => ({ ...f }));
  if (figures.length === 0) return out;
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const pageCanvas = new Map<number, HTMLCanvasElement>();

    for (const f of out) {
      try {
        let canvas = pageCanvas.get(f.page);
        if (!canvas) {
          const pg = await pdf.getPage(f.page);
          const vp = pg.getViewport({ scale: RENDER_SCALE });
          canvas = document.createElement("canvas");
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
          pageCanvas.set(f.page, canvas);
        }
        const [x0, y0, x1, y1] = f.bbox_norm;
        const cx = Math.max(0, Math.floor(x0 * canvas.width));
        const cy = Math.max(0, Math.floor(y0 * canvas.height));
        const cw = Math.min(canvas.width - cx, Math.ceil((x1 - x0) * canvas.width));
        const ch = Math.min(canvas.height - cy, Math.ceil((y1 - y0) * canvas.height));
        if (cw <= 0 || ch <= 0) continue;
        const crop = document.createElement("canvas");
        crop.width = cw;
        crop.height = ch;
        const cctx = crop.getContext("2d");
        if (!cctx) continue;
        cctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
        f.thumb = crop.toDataURL("image/png");
      } catch {
        /* one bad region shouldn't drop the rest — leave thumb undefined */
      }
    }
  } catch {
    /* PDF couldn't be opened — return the figures without thumbs (labels still pickable) */
  }
  return out;
}
