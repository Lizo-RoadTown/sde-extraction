import { useEffect, useMemo, useState } from "react";
import { SectionTitle, Badge, SlotView, ConfidenceChip, cx } from "../ui";
import { Card } from "../ui";

// Mock extractor-confidence for an item, deterministic from its id (stable across
// renders). Structure-level: replaced by the engine's real per-dimension score later.
function mockConfidence(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return 0.35 + (h / 1000) * 0.6; // 0.35–0.95
}
import { loadEscalations } from "../data";
import { PdfPane } from "./PdfPane";
import { FigurePane } from "./FigurePane";
import type { FigureExtraction, NamedSlot, Slot } from "../types";

// The slot the verifier is focused on — drives the PDF pane's jump-to-source.
type Focus = { page: number; quote: string } | null;

// The verifier's judgment on one slot. "unjudged" is a real, distinct state —
// per docs/UX_CONTRACT.md, judged-absent must never look like not-yet-reviewed.
type Judgment = "unjudged" | "present" | "absent";

function SlotRow({
  row,
  judgment,
  focused,
  onJudge,
  onFocus,
}: {
  row: NamedSlot;
  judgment: Judgment;
  focused: boolean;
  onJudge: (j: "present" | "absent") => void;
  onFocus: () => void;
}) {
  const engineSays: Slot["status"] = row.slot.status;
  const canFocus = row.slot.status === "present"; // present slots have a quote+page to jump to
  return (
    <div
      className={cx(
        "flex items-start justify-between gap-4 border-b border-edge/60 py-2 last:border-0",
        judgment === "unjudged" && "opacity-95", // subtle: still needs a decision
        focused && "bg-active-soft/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mono mt-0.5 w-16 text-sm text-active">{row.symbol}</span>
        {canFocus ? (
          <button type="button" onClick={onFocus} className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-active"
            title="show this quote in the PDF">
            <SlotView slot={row.slot} />
          </button>
        ) : (
          <SlotView slot={row.slot} />
        )}
      </div>
      {/* present/absent control — the core interaction. The verifier confirms or overrides
          what the engine extracted; the chosen button lights with its semantic color. */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-pressed={judgment === "present"}
          onClick={() => onJudge("present")}
          className={cx(
            "rounded px-2 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active",
            judgment === "present"
              ? "bg-present-soft text-present"
              : "bg-absent-soft text-ink-dim hover:text-ink",
          )}
        >
          present
        </button>
        <button
          type="button"
          aria-pressed={judgment === "absent"}
          onClick={() => onJudge("absent")}
          className={cx(
            "rounded px-2 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-attention",
            judgment === "absent"
              ? "bg-attention-soft text-attention"
              : "bg-absent-soft text-ink-dim hover:text-ink",
          )}
        >
          absent
        </button>
        {row.slot.status === "absent" && (
          <select
            aria-label="absence reason"
            defaultValue={row.slot.reason}
            className="rounded bg-surface-raised px-1.5 py-1 text-xs text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-active"
          >
            <option value="not_stated">not_stated</option>
            <option value="requires_inference">requires_inference</option>
          </select>
        )}
        {/* unjudged marker — the decision the verifier still owes this slot */}
        {judgment === "unjudged" && (
          <span
            className="ml-1 inline-flex items-center"
            title={`engine extracted "${engineSays}" — confirm or override`}
            aria-label="not yet judged"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-attention" />
          </span>
        )}
      </div>
    </div>
  );
}

function Detail({ ext }: { ext: FigureExtraction }) {
  const rows: NamedSlot[] = useMemo(
    () => [
      ...ext.stateVariables,
      ...ext.parameters,
      ...ext.driftTerms.map((d) => ({ symbol: `drift ${d.variable}`, slot: d.slot })),
      ...ext.diffusionTerms.map((d) => ({ symbol: `diff ${d.variable}`, slot: d.slot })),
    ],
    [ext],
  );

  // Verifier judgments, keyed by row index. (Detail is mounted with key={ext.id} by the
  // parent, so switching extractions remounts this fresh — no manual reset needed.)
  const [judgments, setJudgments] = useState<Record<number, "present" | "absent">>({});

  // Which slot is focused in the PDF pane, and which row index it maps to.
  const [focus, setFocus] = useState<Focus>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const judgedCount = Object.keys(judgments).length;
  const allJudged = judgedCount === rows.length;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-ink">{ext.paperTitle}</div>
          <div className="text-xs text-ink-faint">{ext.figureLabel} · {ext.pathogen} · {ext.doi}</div>
        </div>
        <a href={ext.pdfUrl} className="rounded-md bg-surface-raised px-3 py-1.5 text-xs text-ink hover:bg-edge">open PDF ↗</a>
      </div>

      {/* two panes: source PDF (jumps to the focused slot's page) + figure-compare oracle */}
      <div className="grid grid-cols-2 gap-4">
        <PdfPane pdfUrl={ext.pdfUrl} targetPage={focus?.page} quote={focus?.quote} />
        <FigurePane ext={ext} />
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Slots — confirm present / absent</span>
          <span className="text-xs text-ink-faint">{judgedCount}/{rows.length} judged</span>
        </div>
        {rows.map((r, i) => (
          <SlotRow
            key={i}
            row={r}
            judgment={judgments[i] ?? "unjudged"}
            focused={focusIdx === i}
            onJudge={(j) => setJudgments((prev) => ({ ...prev, [i]: j }))}
            onFocus={() => {
              if (r.slot.status === "present") {
                setFocus({ page: r.slot.page, quote: r.slot.quote });
                setFocusIdx(i);
              }
            }}
          />
        ))}
        <div className="mt-3 flex items-center justify-between rounded-md bg-surface-raised/60 px-3 py-2">
          <span className="text-xs text-ink-dim">Figure binding — “which values made this figure?”</span>
          <SlotView slot={ext.figureBinding} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {/* rule zero: the verifier commits to every slot before the system lets them store. */}
        {!allJudged && (
          <span className="text-xs text-ink-faint">{rows.length - judgedCount} slot(s) still need a judgment</span>
        )}
        <button type="button" className="rounded-md bg-surface-raised px-4 py-2 text-sm text-ink hover:bg-edge">Send back</button>
        <button
          type="button"
          disabled={!allJudged}
          className={cx(
            "rounded-md px-4 py-2 text-sm transition",
            allJudged
              ? "bg-present-soft text-present hover:brightness-110"
              : "cursor-not-allowed bg-absent-soft text-ink-faint opacity-50",
          )}
        >
          Approve &amp; store
        </button>
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

  if (!ext) return <div className="p-6 text-sm text-ink-dim">No escalations in the queue.</div>;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <SectionTitle hint="An escalation inbox — the verifying agent already cleared what's machine-provable and surfaces only what needs your eyes, with lineage, proof, and the PDF. Ordered lowest-confidence first, so the riskiest extractions get your eyes first.">
        Verify
      </SectionTitle>
      <div className="flex gap-4">
        {/* escalation inbox — sorted lowest extractor-confidence first (riskiest first) */}
        <div className="flex w-64 shrink-0 flex-col gap-2">
          {[...escalations]
            .sort((a, b) => mockConfidence(a.id) - mockConfidence(b.id))
            .map((e) => (
            <button type="button" key={e.id} onClick={() => setSelected(e.id)}
              className={cx("rounded-md border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-active", e.id === selected ? "border-active-edge bg-active-soft" : "border-edge bg-surface-raised/40 hover:bg-surface-raised/70")}>
              <div className="text-sm text-ink">{e.figureLabel}</div>
              <div className="truncate text-xs text-ink-faint">{e.paperTitle}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone="amber">needs human</Badge>
                <ConfidenceChip score={mockConfidence(e.id)} />
              </div>
            </button>
          ))}
        </div>
        <Detail key={ext.id} ext={ext} />
      </div>
    </div>
  );
}
