import { useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Badge, StatCard, cx } from "../ui";
import { loadJobs, uploadPaper, type UploadedPaper } from "../data";
import { supabaseConfigured } from "../lib/supabase";
import type { Job } from "../types";

// Engine-found figures the user confirms (locked decision: engine enumerates, user confirms).
const foundFigures = [
  { label: "Figure 1", caption: "Deterministic SIR trajectories", page: 6 },
  { label: "Figure 2", caption: "Stochastic realizations (σ = 5E-6)", page: 12 },
  { label: "Figure 3", caption: "Sensitivity to noise intensity", page: 14 },
];

const stageLabel: Record<string, string> = {
  ingest: "Ingest", pdf_to_math: "PDF→math", extract: "Extract",
  machine_verify: "Machine verify", human_verify: "Human verify", stored: "Stored", failed: "Failed",
};

type UploadState =
  | { kind: "idle" }
  | { kind: "working"; step: string; filename: string }
  | { kind: "done"; paper: UploadedPaper }
  | { kind: "error"; message: string };

export function Intake() {
  const [picked, setPicked] = useState<string[]>(["Figure 2"]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadJobs().then(setJobs);
  }, []);
  const toggle = (l: string) =>
    setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l]));

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUpload({ kind: "error", message: "Not a PDF — the only accepted input is a paper PDF." });
      return;
    }
    try {
      setUpload({ kind: "working", step: "fingerprinting", filename: file.name });
      const paper = await uploadPaper(file); // fingerprints, then uploads if Supabase is configured
      setUpload({ kind: "done", paper });
      loadJobs().then(setJobs); // refresh the queue
    } catch (e) {
      setUpload({ kind: "error", message: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SectionTitle hint="A PDF is the only input. It's fingerprinted (SHA-256) the moment it lands.">
        Intake
      </SectionTitle>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose a paper PDF to upload"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Card className={cx(
            "flex flex-col items-center justify-center gap-2 border-dashed py-12 text-center transition",
            dragOver && "border-active-edge bg-active-soft",
          )}>
            {upload.kind === "working" ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-active" />
                <div className="text-sm text-ink">{upload.step}…</div>
                <div className="mono truncate text-xs text-ink-faint">{upload.filename}</div>
              </>
            ) : upload.kind === "done" ? (
              <>
                <Badge tone="green">fingerprinted</Badge>
                <div className="mono truncate text-xs text-ink-dim">sha256 {upload.paper.fileSha256.slice(0, 16)}…</div>
                <div className="truncate text-xs text-ink-faint">{upload.paper.filename}</div>
                {!supabaseConfigured && (
                  <div className="text-[11px] text-attention">mock mode — fingerprinted locally, not stored</div>
                )}
                <button type="button" onClick={() => fileInput.current?.click()}
                  className="mt-1 rounded-md bg-surface-raised px-3 py-1.5 text-sm text-ink hover:bg-edge">
                  Upload another
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-ink-dim">Drop a paper PDF here</div>
                <div className="text-xs text-ink-faint">or click to browse · fingerprinted (SHA-256) on upload</div>
                {upload.kind === "error" && (
                  <div className="text-xs text-invalid" role="alert">{upload.message}</div>
                )}
                <button type="button" onClick={() => fileInput.current?.click()}
                  className="mt-2 rounded-md bg-active-soft px-3 py-1.5 text-sm text-active hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-active">
                  Choose PDF
                </button>
              </>
            )}
          </Card>
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Figures found</span>
            <Badge tone="cyan">engine found 3 · you confirm</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {foundFigures.map((f) => (
              <label key={f.label} className="flex cursor-pointer items-center gap-3 rounded-md border border-edge px-3 py-2 hover:bg-surface-raised/60">
                <input type="checkbox" checked={picked.includes(f.label)} onChange={() => toggle(f.label)} className="accent-[color:var(--color-active)]" />
                <div className="flex-1">
                  <div className="text-sm text-ink">{f.label}</div>
                  <div className="text-xs text-ink-faint">{f.caption} · p.{f.page}</div>
                </div>
              </label>
            ))}
          </div>
          <button className="mt-3 w-full rounded-md bg-active-soft py-2 text-sm text-active hover:brightness-110">
            Extract {picked.length} figure{picked.length === 1 ? "" : "s"} →
          </button>
        </Card>
      </div>

      <div>
        <SectionTitle>Intake queue</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Queued" value="1" />
          <StatCard label="Processing" value="3" tone="cyan" />
          <StatCard label="Done today" value="12" tone="green" />
          <StatCard label="Failed" value="1" tone="red" />
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs uppercase text-ink-faint">
                <th className="px-4 py-2">Paper</th><th className="px-4 py-2">Figure</th>
                <th className="px-4 py-2">Stage</th><th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-2 text-ink-dim">{j.paper}</td>
                  <td className="px-4 py-2 text-ink-dim">{j.figure}</td>
                  <td className="px-4 py-2">
                    <Badge tone={j.stage === "failed" ? "red" : j.stage === "stored" ? "green" : "cyan"}>
                      {stageLabel[j.stage]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-ink-faint">{j.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
