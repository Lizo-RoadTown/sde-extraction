import { Card, SectionTitle, Badge, StatCard } from "../ui";

// Extraction Health — "how well is the engine doing, and is it improving?"
// Two real concerns in one home: CONFIDENCE (earned per extractor x dimension-value)
// and the AGENT SELF-UPDATE loop (propose -> human approves -> trust accrues).
// Confidence scores + tags do not exist in the data yet — this ships as the STRUCTURE
// (the self-update loop is real; confidence is a designed, not-yet-populated view), per
// docs/superpowers/specs/2026-06-12-dashboard-nav-redesign-design.md.

// Independent tagging dimensions confidence is tracked along (model type, figure type, +
// emergent). Per the confidence pillar: a VECTOR of scores, never one blended number.
const dimensions = [
  {
    name: "Model type",
    values: [
      { tag: "Ornstein–Uhlenbeck", score: 0.86, n: 14 },
      { tag: "Environmental noise", score: 0.42, n: 9 },
      { tag: "Demographic / CLE", score: 0.71, n: 6 },
    ],
  },
  {
    name: "Figure type",
    values: [
      { tag: "Stochastic realizations", score: 0.78, n: 18 },
      { tag: "Sensitivity sweep", score: 0.55, n: 7 },
    ],
  },
];

// Confidence band -> the semantic tone it reads as (exception-marking, not neon).
function bandTone(score: number): "green" | "amber" | "red" {
  if (score >= 0.75) return "green";
  if (score >= 0.5) return "amber";
  return "red";
}

function ConfidenceRow({ tag, score, n }: { tag: string; score: number; n: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-44 shrink-0 truncate text-sm text-ink">{tag}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
        <div
          className={
            bandTone(score) === "green" ? "h-full bg-present"
            : bandTone(score) === "amber" ? "h-full bg-attention"
            : "h-full bg-invalid"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="mono w-10 shrink-0 text-right text-xs text-ink-dim">{(score).toFixed(2)}</span>
      <span className="w-14 shrink-0 text-right text-[11px] text-ink-faint">n={n}</span>
    </div>
  );
}

export function ExtractionHealth() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="How well the engine extracts, by document type — and how it improves over time. Confidence is earned from your verifications; it is never assigned.">
        Extraction Health
      </SectionTitle>

      {/* headline gauges */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Figure-repro pass" value="86%" tone="green" />
        <StatCard label="Present / absent" value="73 / 27" tone="cyan" />
        <StatCard label="Avg verify" value="3.4m" />
        <StatCard label="Extractor trust" value="0.81" tone="cyan" />
      </div>

      {/* confidence by dimension — the vector, not a blended score */}
      <div>
        <SectionTitle hint="Per extractor × document dimension. Each axis is independent — an extractor can be trusted on one type and not another. (Structure shown; live scores arrive when the engine + schema emit them.)">
          Confidence by dimension
        </SectionTitle>
        <div className="flex flex-col gap-4">
          {dimensions.map((d) => (
            <Card key={d.name}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{d.name}</span>
                <Badge tone="slate">not yet live · sample</Badge>
              </div>
              {d.values.map((v) => <ConfidenceRow key={v.tag} {...v} />)}
            </Card>
          ))}
        </div>
      </div>

      {/* agent self-update loop — the real machinery, moved here from Process */}
      <div>
        <SectionTitle hint="The same self-updating loop the curation had: agents propose improvements, a human approves, trust accrues.">
          Agent self-update
        </SectionTitle>
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-sm text-ink">Extractor proposes: tighten σ sourcing to caption-first</div>
            <div className="text-xs text-ink-faint">predicted +6% figure-repro pass · trust 0.81</div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded-md bg-present-soft px-3 py-1.5 text-sm text-present hover:brightness-110">Approve</button>
            <button type="button" className="rounded-md bg-surface-raised px-3 py-1.5 text-sm text-ink-dim hover:bg-edge">Reject</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
