import { Card, Badge } from "../ui";
import type { FigureExtraction } from "../types";

// The verification oracle: the paper's figure vs. the figure regenerated from the
// captured values. The regenerated side is produced by the engine (not built yet),
// so today this pane shows the oracle STATUS and reserves the two image slots —
// functional with what exists, wires up when the engine emits figure images.
export function FigurePane({ ext }: { ext: FigureExtraction }) {
  const repro = ext.figureReproduced;
  const tone = repro === true ? "green" : repro === false ? "red" : "slate";
  const label = repro === true ? "reproduced" : repro === false ? "not reproduced" : "not run yet";

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Figure compare</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FigureSlot caption={`paper · ${ext.figureLabel}`} />
        <FigureSlot caption="regenerated" />
      </div>
      <p className="shrink-0 text-[11px] text-ink-faint">
        The oracle: did the captured values regenerate the paper’s figure? Image compare lands when
        the engine emits figures.
      </p>
    </Card>
  );
}

function FigureSlot({ caption }: { caption: string }) {
  return (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-edge bg-surface-raised/40 text-center">
      <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">no image yet</span>
      <span className="text-xs text-ink-faint">{caption}</span>
    </div>
  );
}
