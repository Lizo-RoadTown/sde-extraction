import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge, SlotView, cx } from "../ui";
import { loadEscalations } from "../data";
import type { FigureExtraction, NamedSlot } from "../types";

function SlotRow({ row }: { row: NamedSlot }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800/60 py-2 last:border-0">
      <div className="flex items-start gap-3">
        <span className="mono mt-0.5 w-16 text-sm text-cyan-300">{row.symbol}</span>
        <SlotView slot={row.slot} />
      </div>
      {/* present/absent control — the core interaction */}
      <div className="flex shrink-0 items-center gap-1">
        <button className={cx("rounded px-2 py-1 text-xs", row.slot.status === "present" ? "bg-emerald-500/25 text-emerald-200" : "bg-slate-700/50 text-slate-400")}>present</button>
        <button className={cx("rounded px-2 py-1 text-xs", row.slot.status === "absent" ? "bg-amber-500/25 text-amber-200" : "bg-slate-700/50 text-slate-400")}>absent</button>
        {row.slot.status === "absent" && (
          <select aria-label="absence reason" defaultValue={row.slot.reason} className="rounded bg-slate-800 px-1.5 py-1 text-xs text-slate-300">
            <option value="not_stated">not_stated</option>
            <option value="requires_inference">requires_inference</option>
          </select>
        )}
      </div>
    </div>
  );
}

function Detail({ ext }: { ext: FigureExtraction }) {
  const rows: NamedSlot[] = [
    ...ext.stateVariables,
    ...ext.parameters,
    ...ext.driftTerms.map((d) => ({ symbol: `drift ${d.variable}`, slot: d.slot })),
    ...ext.diffusionTerms.map((d) => ({ symbol: `diff ${d.variable}`, slot: d.slot })),
  ];
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-100">{ext.paperTitle}</div>
          <div className="text-xs text-slate-500">{ext.figureLabel} · {ext.pathogen} · {ext.doi}</div>
        </div>
        <a href={ext.pdfUrl} className="rounded-md bg-slate-700/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">open PDF ↗</a>
      </div>

      {/* two panes: source + figure-compare (the build proves never had) */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="flex h-40 flex-col items-center justify-center border-dashed text-center text-xs text-slate-500">
          <div className="text-2xl">🔍</div>
          PDF viewer — jump-to-source highlight<br />(offset-anchored span)
        </Card>
        <Card className="flex h-40 flex-col items-center justify-center border-dashed text-center text-xs text-slate-500">
          <div className="text-2xl">📊</div>
          Figure compare — paper vs. regenerated<br />the verification oracle
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">Slots — confirm present / absent</span>
          <span className="text-xs text-slate-500">{rows.filter((r) => r.slot.status === "present").length}/{rows.length} present</span>
        </div>
        {rows.map((r, i) => <SlotRow key={i} row={r} />)}
        <div className="mt-3 flex items-center justify-between rounded-md bg-slate-800/40 px-3 py-2">
          <span className="text-xs text-slate-400">Figure binding — “which values made this figure?”</span>
          <SlotView slot={ext.figureBinding} />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <button className="rounded-md bg-slate-700/60 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">Send back</button>
        <button className="rounded-md bg-emerald-500/25 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/35">Approve & store</button>
      </div>
    </div>
  );
}

export function Verify() {
  const [escalations, setEscalations] = useState<FigureExtraction[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    loadEscalations().then((e) => {
      setEscalations(e);
      setSelected((cur) => cur ?? e[0]?.id ?? null);
    });
  }, []);
  const ext = escalations.find((e) => e.id === selected);

  if (!ext) return <div className="p-6 text-sm text-slate-400">No escalations in the queue.</div>;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <SectionTitle hint="An escalation inbox — the verifying agent already cleared what's machine-provable and surfaces only what needs your eyes, with lineage, proof, and the PDF.">
        Verify
      </SectionTitle>
      <div className="flex gap-4">
        {/* escalation inbox */}
        <div className="flex w-64 shrink-0 flex-col gap-2">
          {escalations.map((e) => (
            <button key={e.id} onClick={() => setSelected(e.id)}
              className={cx("rounded-md border p-3 text-left", e.id === selected ? "border-cyan-500/50 bg-cyan-500/10" : "border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/70")}>
              <div className="text-sm text-slate-200">{e.figureLabel}</div>
              <div className="truncate text-xs text-slate-500">{e.paperTitle}</div>
              <div className="mt-1"><Badge tone="amber">needs human</Badge></div>
            </button>
          ))}
        </div>
        <Detail ext={ext} />
      </div>
    </div>
  );
}
