import { useEffect, useState } from "react";
import { Card, Badge } from "../ui";
import type { FigureExtraction } from "../types";
import { signedPdfUrl } from "../data";
import { renderRegionFromUrl } from "../cropFigures";

// The verification oracle: the paper's figure (the one the worker ISOLATED) vs. the figure
// regenerated from the captured values. The paper side now shows the REAL isolated figure, cropped
// from the PDF to the server's exact bbox (figureProvenance). The regenerated side is produced by the
// engine (not built yet) — shown honestly as "not run yet", never faked.
export function FigurePane({ ext }: { ext: FigureExtraction }) {
  const repro = ext.figureReproduced;
  const tone = repro === true ? "green" : repro === false ? "red" : "slate";
  const label = repro === true ? "reproduced" : repro === false ? "not reproduced" : "not run yet";

  const fp = ext.figureProvenance;
  const [paperImg, setPaperImg] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "rendering" | "failed">(fp ? "rendering" : "idle");

  useEffect(() => {
    let live = true;
    if (!fp || !ext.storagePath) { setState("idle"); return; }
    setState("rendering");
    signedPdfUrl(ext.storagePath).then(async (u) => {
      if (!u || !live) { if (live) setState("failed"); return; }
      const img = await renderRegionFromUrl(u, fp.page, fp.bboxNorm);
      if (!live) return;
      if (img) { setPaperImg(img); setState("idle"); } else { setState("failed"); }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp?.page, fp?.bboxNorm?.[0], ext.storagePath]);

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Figure compare</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* paper side — the actual isolated figure */}
        <figure className="flex flex-col gap-1">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-edge bg-white">
            {paperImg ? (
              <img src={paperImg} alt={`paper · ${fp?.label || ext.figureLabel}`} className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] uppercase tracking-wider text-ink-dim">
                {state === "rendering" ? "rendering figure…" : state === "failed" ? "couldn't render figure" : "no figure"}
              </span>
            )}
          </div>
          <figcaption className="text-center text-xs text-ink-faint">paper · {fp?.label || ext.figureLabel}</figcaption>
        </figure>
        {/* regenerated side — honest: the engine doesn't emit this yet */}
        <figure className="flex flex-col gap-1">
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-edge bg-surface-raised/40 text-center">
            <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">not run yet</span>
          </div>
          <figcaption className="text-center text-xs text-ink-faint">regenerated</figcaption>
        </figure>
      </div>
      <p className="shrink-0 text-[11px] text-ink-faint">
        The oracle: did the captured values regenerate the paper’s figure? The paper figure is the one
        the engine isolated; the image compare completes when the engine emits the regenerated figure.
      </p>
    </Card>
  );
}
