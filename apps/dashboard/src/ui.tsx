import type { ReactNode } from "react";
import type { Slot } from "./types";

export function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-2xl border border-edge bg-surface-raised/50 p-4", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="display text-2xl text-ink">{children}</h2>
      {hint && <p className="mt-1 text-sm text-ink-dim">{hint}</p>}
    </div>
  );
}

// Tones map to the six semantic roles in index.css / docs/UX_CONTRACT.md.
// The legacy color keys are kept as aliases so existing callers don't change.
const badgeTones: Record<string, string> = {
  slate: "bg-absent-soft text-absent border-edge",
  green: "bg-present-soft text-present border-present-edge",
  amber: "bg-attention-soft text-attention border-attention-edge",
  red: "bg-invalid-soft text-invalid border-invalid-edge",
  cyan: "bg-active-soft text-active border-active-edge",
  violet: "bg-lineage-soft text-lineage border-lineage-soft",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

const statTone: Record<string, string> = {
  slate: "text-ink",
  green: "text-present",
  amber: "text-attention",
  red: "text-invalid",
  cyan: "text-active",
  violet: "text-lineage",
};

export function StatCard({ label, value, tone = "slate" }: { label: string; value: ReactNode; tone?: keyof typeof statTone }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-ink-dim">{label}</span>
      <span className={cx("text-2xl font-semibold", statTone[tone])}>{value}</span>
    </Card>
  );
}

// The heart of our model in the UI: a slot is present (value + lineage) or absent (a reason).
// Per docs/UX_CONTRACT.md, present / absent must be visually unambiguous — never blank:
//  - present  -> a filled card that "fill-pop"s in (the value, its meaning, source, lineage)
//  - absent   -> a marked state with its reason, rendered as a dashed "?" slot (a decision,
//                not a missing hole). not_stated is neutral; requires_inference is attention.
export function SlotView({ slot }: { slot: Slot }) {
  if (slot.status === "absent") {
    const attention = slot.reason === "requires_inference";
    return (
      <div
        className={cx(
          "fill-pop inline-flex items-center gap-2 rounded-md border border-dashed px-2 py-1",
          attention ? "border-attention-edge bg-attention-soft" : "border-edge bg-absent-soft",
        )}
      >
        <span className={cx("mono text-sm", attention ? "text-attention" : "text-ink-faint")}>?</span>
        <Badge tone={attention ? "amber" : "slate"}>absent</Badge>
        <span className="mono text-xs text-ink-dim">{slot.reason}</span>
      </div>
    );
  }
  return (
    <div className="fill-pop flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="mono text-sm text-ink">{slot.value}</span>
        <Badge tone="green">present</Badge>
      </div>
      <span className="text-xs text-ink-dim">{slot.meaning}</span>
      <span className="mono text-[11px] text-ink-faint">
        “{slot.quote}” · p.{slot.page}{slot.sha256 ? ` · sha256 ${slot.sha256}` : ""}
      </span>
    </div>
  );
}
