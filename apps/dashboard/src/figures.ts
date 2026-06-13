import { pdfjs } from "react-pdf";

// Stage 1 — figure detection, done with PRECISION by a script (no LLM). Scan the PDF's text
// layer for figure captions ("Figure 2: …", "Fig. 3 …") and list every figure so the user can
// choose one (or ask the agent to auto-detect). The LLM never decides what figures exist.
// Deterministic, client-side (the dashboard already has pdf.js), instant on upload.

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export interface DetectedFigure {
  label: string;   // normalized, e.g. "Figure 2" / "Figure 3a"
  caption: string; // the text following the label (best-effort — the longest occurrence)
  page: number;
}

export async function detectFigures(file: File): Promise<DetectedFigure[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  // key: figure number (+ optional sub-letter) → keep the occurrence with the longest caption,
  // which is almost always the real caption rather than an in-text reference ("see Fig. 2").
  const found = new Map<string, DetectedFigure>();
  const re = /\bfig(?:ure)?s?\.?\s*(\d{1,2})\s*([a-d])?\b[\s:.)\-–—]*([^\n]{0,180})/gi;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items
      .map((i) => ("str" in i ? (i as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const num = m[1];
      const sub = (m[2] ?? "").toLowerCase();
      const key = num + sub;
      const label = `Figure ${num}${sub}`;
      const caption = (m[3] || "").trim();
      const prev = found.get(key);
      if (!prev || caption.length > prev.caption.length) {
        found.set(key, { label, caption, page: prev?.page && prev.caption.length >= caption.length ? prev.page : p });
      }
    }
  }
  return Array.from(found.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}
