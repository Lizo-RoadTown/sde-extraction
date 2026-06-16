import { useMemo, useState } from "react";
import { marked } from "marked";
import { cx } from "../ui";

// Docs surface — renders the project documentation IN the dashboard so it's visible without a
// separate deploy. Sources the REAL markdown from apps/docs (single source, no duplication) via
// Vite's glob-as-raw, strips Starlight frontmatter, and renders it. Grouped by section in a
// left rail; pick a page, read it on the right.

const RAW = import.meta.glob("../../../docs/src/content/docs/**/*.md", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

interface Doc { id: string; section: string; title: string; order: number; html: string }

const SECTION_ORDER = ["start", "explanation", "reference", "how-to", "decisions", "tutorials"];
const SECTION_LABEL: Record<string, string> = {
  start: "Start here", explanation: "Explanation", reference: "Reference",
  "how-to": "How-to", decisions: "Decisions (ADRs)", tutorials: "Tutorials",
};

function parse(path: string, raw: string): Doc {
  // path: ../../../docs/src/content/docs/<section>/<name>.md
  const rel = path.split("/content/docs/")[1] ?? path;
  const section = rel.includes("/") ? rel.split("/")[0] : "start";
  const name = rel.split("/").pop()!.replace(/\.md$/, "");
  let title = name, body = raw;
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    const t = fm[1].match(/title:\s*["']?(.+?)["']?\s*$/m);
    if (t) title = t[1];
    body = fm[2];
  } else {
    const h1 = raw.match(/^#\s+(.+)$/m);
    if (h1) title = h1[1];
  }
  const order = parseInt(name.match(/^(\d+)/)?.[1] ?? "999", 10);
  return { id: rel, section, title, order, html: marked.parse(body) as string };
}

export function Docs() {
  const docs = useMemo(() => {
    const list = Object.entries(RAW).map(([p, r]) => parse(p, r));
    list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    return list;
  }, []);
  const grouped = useMemo(() => {
    const g: Record<string, Doc[]> = {};
    for (const d of docs) (g[d.section] ??= []).push(d);
    return g;
  }, [docs]);

  const [activeId, setActiveId] = useState<string>(() =>
    docs.find((d) => d.id.includes("canon"))?.id ?? docs[0]?.id ?? "");
  const active = docs.find((d) => d.id === activeId) ?? docs[0];

  if (!docs.length) {
    return <div className="p-6 text-sm text-ink-faint">No documentation found.</div>;
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      {/* left rail — sections + pages */}
      <nav className="w-60 shrink-0">
        <div className="mb-3 text-sm font-medium text-ink">Documentation</div>
        <div className="flex flex-col gap-4">
          {SECTION_ORDER.filter((s) => grouped[s]?.length).map((s) => (
            <div key={s}>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{SECTION_LABEL[s] ?? s}</div>
              <div className="flex flex-col">
                {grouped[s].map((d) => (
                  <button key={d.id} type="button" onClick={() => setActiveId(d.id)}
                    className={cx("rounded px-2 py-1 text-left text-[13px] transition",
                      d.id === active?.id ? "bg-active-soft text-active" : "text-ink-dim hover:bg-surface-raised/60")}>
                    {d.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* rendered page */}
      <article className="sde-doc min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: active?.html ?? "" }} />
      <style>{DOC_CSS}</style>
    </div>
  );
}

// Prose styling in UX_CONTRACT tokens (no external prose plugin). Trusted content (our own docs).
const DOC_CSS = `
.sde-doc { color: #c4ccca; font-size: 14px; line-height: 1.7; max-width: 52rem; }
.sde-doc h1 { font-family: "Instrument Serif", Georgia, serif; font-size: 1.9rem; color: #f3f5f4; margin: 0 0 .6rem; }
.sde-doc h2 { font-size: 1.15rem; color: #f3f5f4; margin: 1.6rem 0 .5rem; border-bottom: 1px solid #2a2f31; padding-bottom: .3rem; }
.sde-doc h3 { font-size: 1rem; color: #f3f5f4; margin: 1.2rem 0 .4rem; }
.sde-doc p, .sde-doc li { color: #c4ccca; }
.sde-doc a { color: #6fa8ac; text-decoration: none; }
.sde-doc a:hover { text-decoration: underline; }
.sde-doc code { font-family: "JetBrains Mono", monospace; font-size: .85em; background: #16191b; border: 1px solid #2a2f31; border-radius: 4px; padding: .05rem .3rem; color: #d8b06a; }
.sde-doc pre { background: #0e1112; border: 1px solid #2a2f31; border-radius: 8px; padding: .9rem 1rem; overflow-x: auto; }
.sde-doc pre code { background: none; border: none; color: #c4ccca; padding: 0; }
.sde-doc ul, .sde-doc ol { padding-left: 1.3rem; }
.sde-doc li { margin: .2rem 0; }
.sde-doc table { border-collapse: collapse; width: 100%; margin: .8rem 0; font-size: 13px; }
.sde-doc th, .sde-doc td { border: 1px solid #2a2f31; padding: .4rem .6rem; text-align: left; }
.sde-doc th { background: #16191b; color: #f3f5f4; }
.sde-doc blockquote { border-left: 3px solid #2a2f31; margin: .8rem 0; padding: .2rem 0 .2rem 1rem; color: #8b9492; }
.sde-doc strong { color: #f3f5f4; }
.sde-doc hr { border: none; border-top: 1px solid #2a2f31; margin: 1.5rem 0; }
`;
