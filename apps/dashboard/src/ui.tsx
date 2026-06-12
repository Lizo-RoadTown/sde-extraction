import type { ReactNode } from "react";
import type { Slot } from "./types";

export function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-lg border border-slate-700/60 bg-slate-800/40 p-4", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-slate-100">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-400">{hint}</p>}
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
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className={cx("text-2xl font-semibold", statTone[tone])}>{value}</span>
    </Card>
  );
}

// The heart of our model in the UI: a slot is present (value + lineage) or absent (a reason).
export function SlotView({ slot }: { slot: Slot }) {
  if (slot.status === "absent") {
    return (
      <div className="flex items-center gap-2">
        <Badge tone={slot.reason === "not_stated" ? "slate" : "amber"}>absent</Badge>
        <span className="mono text-xs text-slate-400">{slot.reason}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="mono text-sm text-slate-100">{slot.value}</span>
        <Badge tone="green">present</Badge>
      </div>
      <span className="text-xs text-slate-400">{slot.meaning}</span>
      <span className="mono text-[11px] text-slate-500">
        “{slot.quote}” · p.{slot.page}{slot.sha256 ? ` · sha256 ${slot.sha256}` : ""}
      </span>
    </div>
  );
}
