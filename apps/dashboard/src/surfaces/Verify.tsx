import { useEffect, useMemo, useState } from "react";
import { SectionTitle, Badge, CompletenessChip, cx } from "../ui";
import { Card } from "../ui";
import { loadEscalations, submitVerdict, slotCounts } from "../data";

// Real completeness fraction for an extraction (present / total required fields). Used to order the
// inbox: least-complete first, so the extractions that captured the fewest fields get eyes first.
// No fabrication — computed from the stored model.
function completenessFrac(e: FigureExtraction): number {
  const c = slotCounts(e);
  return c.total ? c.present / c.total : 1;
}
import { PdfPane } from "./PdfPane";
import { FigurePane } from "./FigurePane";
import { SpotlightQuest } from "./SpotlightQuest";
import type { FigureExtraction, Slot } from "../types";

// The slot the verifier is focused on — drives the PDF pane's jump-to-source.
type Focus = { page: number; quote: string } | null;

function SlotRow({
  row,
  focused,
  onFocus,
}: {
  row: { label: string; slot: Slot };
  focused: boolean;
  onFocus: () => void;
}) {
  const slot = row.slot;
  const present = slot.status === "present";
  return (
    <div
      className={cx(
        "grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-3 border-b border-edge/40 py-1.5 last:border-0",
        focused && "bg-active-soft/40",
      )}
    >
      {/* slot */}
      <span className="mono truncate text-xs text-active" title={row.label}>{row.label}</span>
      {/* captured value */}
      <span className="truncate text-sm text-ink" title={present ? slot.value : undefined}>
        {present ? slot.value : <span className="text-ink-faint">—</span>}
      </span>
      {/* source — page + a TRUNCATED quote (full on hover) */}
      <div className="flex min-w-0 items-center gap-2">
        {present ? (
          <>
            <Badge tone="slate">p.{slot.page}</Badge>
            <button type="button" onClick={onFocus} title={slot.quote}
              className="truncate text-left text-[11px] text-ink-faint hover:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
              “{slot.quote}”
            </button>
            {slot.located === false && <span title="quote not found on the page" className="shrink-0 text-[10px] text-invalid">⚠</span>}
          </>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        )}
      </div>
      {/* state — present, or absent + reason. That's the useful information. */}
      <div className="shrink-0 text-right">
        {present
          ? <span className="rounded bg-present-soft px-2 py-0.5 text-[11px] text-present">present</span>
          : <span className="rounded bg-attention-soft px-2 py-0.5 text-[11px] text-attention">absent · {slot.reason}</span>}
      </div>
    </div>
  );
}

// The MODEL — the actual SDE behind the figure, assembled from the extracted drift
// (deterministic) + diffusion (noise) terms. This is what the parameters belong to; without
// it the numbers float. dV = (drift) dt + (diffusion) dW, per variable.
function ModelView({ ext }: { ext: FigureExtraction }) {
  const vars = Array.from(new Set([
    ...ext.driftTerms.map((t) => t.variable),
    ...ext.diffusionTerms.map((t) => t.variable),
  ])).filter(Boolean);
  const exprVal = (s: Slot) => (s.status === "present" ? s.value : null);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">The model — the SDE behind {ext.figureLabel}</span>
        <Badge tone="cyan">drift + diffusion</Badge>
      </div>
      {vars.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge px-3 py-4 text-center text-xs text-ink-faint">
          No drift/diffusion terms were captured — the model behind this figure wasn’t extracted. The parameters below have nothing to belong to yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {vars.map((v) => {
            const drift = ext.driftTerms.filter((t) => t.variable === v).map((t) => exprVal(t.expression)).filter(Boolean) as string[];
            const diff = ext.diffusionTerms.filter((t) => t.variable === v).map((t) => exprVal(t.expression)).filter(Boolean) as string[];
            return (
              <div key={v} className="rounded-md bg-inset px-3 py-2">
                <span className="mono text-sm text-ink">
                  d{v} = {drift.length ? <>({drift.join(" + ")}) dt</> : <span className="text-ink-faint">(drift absent)</span>}
                  {diff.length ? <span className="text-active"> + ({diff.join(" + ")}) dW</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-ink-faint">
        The stochastic model the engine identified as the one that produced <span className="text-ink-dim">{ext.figureLabel}</span> —
        built from the drift + diffusion terms it extracted. Each term traces to a quote in the paper (the table below); the parameters are this model’s constants.
      </p>
    </Card>
  );
}

// `walkthrough` = the guided front-page experience (undergrads / skeptics): show the
// cinematic spotlight search. The power-user lane (bulk queue) leaves it off — PhDs verify
// fast and don't need the walkthrough.
export function Detail({ ext, walkthrough = false, onResolved }: { ext: FigureExtraction; walkthrough?: boolean; onResolved?: (d: "approve" | "send_back") => void }) {
  // Flatten everything the FIGURE required into present/absent rows. Each variable and
  // parameter contributes several slots (meaning, value/initial-condition, units) — every
  // piece the figure needed, each judged present/absent against the source.
  const rows: { label: string; slot: Slot }[] = useMemo(
    () => [
      ...ext.variables.flatMap((v) => [
        { label: `${v.symbol} · meaning`, slot: v.meaning },
        { label: `${v.symbol} · initial value`, slot: v.initialValue },
      ]),
      ...ext.parameters.flatMap((p) => [
        { label: `${p.symbol} · value`, slot: p.value },
        { label: `${p.symbol} · meaning`, slot: p.meaning },
        { label: `${p.symbol} · units`, slot: p.units },
      ]),
      ...ext.driftTerms.map((d) => ({ label: `drift ${d.variable}`, slot: d.expression })),
      ...ext.diffusionTerms.map((d) => ({ label: `diff ${d.variable}`, slot: d.expression })),
      { label: "time · initial", slot: ext.timeSpan.initialTime },
      { label: "time · final", slot: ext.timeSpan.finalTime },
    ],
    [ext],
  );

  // Which slot is focused in the PDF pane, and which row index it maps to.
  const [focus, setFocus] = useState<Focus>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const presentCount = rows.filter((r) => r.slot.status === "present").length;

  // the human gate (V8): submit the verdict, move the extraction, log it.
  const [verdict, setVerdict] = useState<null | "saving" | "approve" | "send_back">(null);
  async function decide(d: "approve" | "send_back") {
    setVerdict("saving");
    const ok = await submitVerdict(ext.id, d);
    if (ok) { setVerdict(d); onResolved?.(d); }
    else setVerdict(null);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* THE FIGURE — the anchor, led with first. Everything else is what it required to be produced. */}
      <Card className="border-active-edge/60 bg-active-soft/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-active">the figure · the anchor</div>
            <div className="display text-lg text-ink">{ext.figureType || ext.figureLabel || "Figure"}</div>
            {ext.outcome && <div className="mt-0.5 text-sm text-ink-dim">{ext.outcome}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              {ext.figureLabel && ext.figureLabel !== "(auto)" && <Badge tone="cyan">{ext.figureLabel}</Badge>}
              {ext.pathogen && <span>{ext.pathogen}</span>}
              {ext.doi && <span>· {ext.doi}</span>}
            </div>
          </div>
          <a href={ext.pdfUrl} className="shrink-0 rounded-md bg-surface-raised px-3 py-1.5 text-xs text-ink hover:bg-edge">open PDF ↗</a>
        </div>
        <div className="mt-3"><FigurePane ext={ext} /></div>
        <p className="mt-2 text-[11px] text-ink-faint">
          This figure is the <span className="text-ink-dim">anchor</span> — a produced outcome that exists. Everything below
          is what it <span className="text-ink-dim">required</span> to be produced, searched backward from it and confirmed present or absent.
        </p>
      </Card>

      {/* the MODEL — the SDE the figure required; what the parameters belong to */}
      <ModelView ext={ext} />

      {/* the lineage made visible: the cinematic spotlight search — guided lane only */}
      {walkthrough && <SpotlightQuest ext={ext} />}

      {/* source PDF on top (full width), figure-compare oracle stacked beneath it —
          both need room; side-by-side made the figure images tiny. */}
      <PdfPane pdfUrl={ext.pdfUrl} storagePath={ext.storagePath} targetPage={focus?.page} quote={focus?.quote} />

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">What {ext.figureLabel} required — present / absent</span>
          <span className="text-xs text-ink-faint">{presentCount} present · {rows.length - presentCount} absent</span>
        </div>
        {/* column header — so the rows read as a table, not a wall of text */}
        <div className="grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-3 border-b border-edge pb-1 text-[10px] uppercase tracking-wide text-ink-faint">
          <span>slot</span>
          <span>captured value</span>
          <span>source</span>
          <span className="text-right">state</span>
        </div>
        {rows.map((r, i) => (
          <SlotRow
            key={i}
            row={r}
            focused={focusIdx === i}
            onFocus={() => {
              if (r.slot.status === "present") {
                setFocus({ page: r.slot.page, quote: r.slot.quote });
                setFocusIdx(i);
              }
            }}
          />
        ))}
        <div className="mt-3 rounded-md bg-surface-raised/60 px-3 py-2 text-xs text-ink-faint">
          Everything <span className="text-ink-dim">{ext.figureLabel}</span> required — each present (with its source) or absent (with the reason).
        </div>
      </Card>

      {verdict === "approve" || verdict === "send_back" ? (
        <div className={cx("rounded-md px-4 py-3 text-sm", verdict === "approve" ? "bg-present-soft text-present" : "bg-attention-soft text-attention")}>
          {verdict === "approve" ? "✓ Approved & stored — moved to the Library." : "↩ Sent back — recorded as rejected."}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3">
          <button type="button" disabled={verdict === "saving"} onClick={() => decide("send_back")}
            className="rounded-md bg-surface-raised px-4 py-2 text-sm text-ink hover:bg-edge disabled:opacity-50">Send back</button>
          <button type="button" disabled={verdict === "saving"} onClick={() => decide("approve")}
            className="rounded-md bg-present-soft px-4 py-2 text-sm text-present transition hover:brightness-110 disabled:opacity-50">
            {verdict === "saving" ? "saving…" : "Approve & store"}
          </button>
        </div>
      )}
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

  if (!ext) return <div className="p-6 text-sm text-ink-dim">No escalations in the queue.</div>;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <SectionTitle hint="An escalation inbox — every extraction awaiting your verdict, with lineage, proof, and the PDF. Ordered least-complete first (fewest fields captured), so the sparsest extractions get your eyes first.">
        Verify
      </SectionTitle>
      <div className="flex gap-4">
        {/* escalation inbox — ordered by real completeness (least-complete first) */}
        <div className="flex w-64 shrink-0 flex-col gap-2">
          {[...escalations]
            .sort((a, b) => completenessFrac(a) - completenessFrac(b))
            .map((e) => (
            <button type="button" key={e.id} onClick={() => setSelected(e.id)}
              className={cx("rounded-md border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active", e.id === selected ? "border-active-edge bg-active-soft" : "border-edge bg-surface-raised/40 hover:bg-surface-raised/70")}>
              <div className="text-sm text-ink">{e.figureLabel}</div>
              <div className="truncate text-xs text-ink-faint">{e.figureType || e.pathogen} · {e.doi}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone="amber">needs human</Badge>
                <CompletenessChip {...slotCounts(e)} />
              </div>
            </button>
          ))}
        </div>
        <Detail key={ext.id} ext={ext} />
      </div>
    </div>
  );
}
