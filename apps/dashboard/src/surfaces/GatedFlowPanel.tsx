import { Card, Badge } from "../ui";
import type { GatedFlow } from "../types";

// Shows the gated-flow (flow_v2) depth that the standard extract→verify view doesn't: which formulation
// FAMILY the model was classified as (with the paper evidence), the per-variable GATE verdicts, and the
// executable curation MODEL the transform built (gated by the AST safety check). All real, stored by the
// worker — nothing fabricated. Renders only when this extraction came from the gated engine.

function verdictTone(v: string): "green" | "amber" | "red" | "slate" {
  return v === "agree" ? "green" : v === "disagree" ? "red" : v === "uncertain" ? "amber" : "slate";
}

export function GatedFlowPanel({ gated }: { gated: GatedFlow }) {
  const cls = gated.classification;
  const exe = gated.executable;
  const cc = gated.crosscheck;
  const gateLog = gated.gateLog ?? {};

  return (
    <Card className="flex flex-col gap-4 border-active-edge/50 bg-active-soft/10">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">Gated flow</span>
        <Badge tone="cyan">per-variable · classified · executable</Badge>
      </div>
      <p className="text-[11px] text-ink-faint">
        How this model was lifted, gate by gate: each variable walked the gates, the model was classified
        against the registry, and an executable curation model was built and safety-checked. All real run
        output — never fabricated.
      </p>

      {/* CLASSIFY */}
      {cls && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">formulation family</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={cls.family_name && cls.family_name !== "unclassified" ? "green" : "amber"}>
              {cls.family_name || "unclassified"}
            </Badge>
            {cls.family_is_new && <Badge tone="violet">proposed (needs human audit)</Badge>}
            {cls.calculus_convention && cls.calculus_convention !== "unspecified" && (
              <span className="text-[11px] text-ink-dim">calculus: <span className="text-ink">{cls.calculus_convention}</span></span>
            )}
            {(cls.transformations ?? []).map((t) => <Badge key={t} tone="slate">{t}</Badge>)}
          </div>
          {cls.evidence_quote && (
            <div className="rounded border border-edge bg-inset px-2 py-1 text-[11px] text-ink-dim">
              <span className="text-ink-faint">evidence{cls.evidence_page ? ` (p.${cls.evidence_page})` : ""}: </span>
              “{cls.evidence_quote}”
            </div>
          )}
        </div>
      )}

      {/* PER-VARIABLE GATES */}
      {Object.keys(gateLog).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">per-variable gates</div>
          <div className="flex flex-col gap-1">
            {Object.entries(gateLog).map(([sym, gates]) => (
              <div key={sym} className="flex items-center gap-2 rounded border border-edge bg-inset px-2 py-1">
                <span className="mono w-28 shrink-0 truncate text-[12px] text-ink" title={sym}>{sym}</span>
                <div className="flex flex-wrap gap-1.5">
                  {gates.map((g, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px]">
                      <span className="text-ink-faint">{g.gate}</span>
                      <Badge tone={verdictTone(g.verdict)}>{g.verdict}</Badge>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXECUTABLE MODEL */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">executable curation model</div>
          {exe && <Badge tone={exe.safe ? "green" : "amber"}>{exe.safe ? "safe · passed the guard" : "not accepted"}</Badge>}
        </div>
        {exe?.safe && exe.model ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] text-ink-faint">
              state: <span className="mono text-ink-dim">{(exe.model.variable_names ?? []).join(", ")}</span>
              {" · params: "}<span className="mono text-ink-dim">{(exe.model.parameter_names ?? []).join(", ")}</span>
            </div>
            <pre className="overflow-auto rounded border border-edge bg-inset p-2 text-[11px] leading-relaxed text-ink-dim">
{`drift_term(t, y, p):
    ${exe.model.drift_code ?? ""}

diffusion_term(t, y, p):
    ${exe.model.diffusion_code ?? ""}`}
            </pre>
            <div className="text-[10px] text-ink-faint">
              {cc?.complete ? "closed system — every variable captured" : "model assembled"} ·
              {" "}reproduction: <span className="text-ink-dim">not run yet</span>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-edge bg-inset px-2 py-2 text-[11px] text-ink-faint">
            No executable model accepted{exe?.reasons?.length ? `: ${exe.reasons.slice(0, 3).join("; ")}` : " yet"}.
            {" "}The safety guard refuses code it can’t verify — honest, not faked.
          </div>
        )}
      </div>
    </Card>
  );
}
