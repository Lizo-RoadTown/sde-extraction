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

const badgeTones: Record<string, string> = {
  slate: "bg-slate-700/50 text-slate-300 border-slate-600/50",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

const statTone: Record<string, string> = {
  slate: "text-slate-100",
  green: "text-emerald-300",
  amber: "text-amber-300",
  red: "text-red-300",
  cyan: "text-cyan-300",
  violet: "text-violet-300",
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
