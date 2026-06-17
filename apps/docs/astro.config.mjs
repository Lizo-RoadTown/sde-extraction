// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

// SDE Extraction documentation — same framework + UI shape as the Knowledge
// Observatory docs (Astro Starlight). Structure follows Diátaxis (Explanation /
// Reference / How-to / Tutorials) + Decisions (ADRs). Sidebar order is explicit
// so the intended scope is visible even where pages are "Not yet documented".
export default defineConfig({
  site: "https://sde-extraction-docs.vercel.app",
  integrations: [
    // astro-mermaid must precede starlight so ```mermaid blocks render as diagrams.
    mermaid({ theme: "dark" }),
    starlight({
      title: "SDE Extraction",
      description:
        "Rigorous documentation for the automated extraction of stochastic-differential-equation epidemiological models from the literature into provable, present/absent structured models.",
      // Match the app's look (UX_CONTRACT): warm-black, Instrument Serif / Inter / JetBrains Mono.
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Lizo-RoadTown/sde-extraction",
        },
      ],
      // Explicit sidebar — the full intended scope is visible; unfinished pages
      // carry a "Not yet documented" banner rather than being hidden.
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Follow a paper, step by step", slug: "start/reproduce" },
            { label: "Reading this documentation", slug: "start/how-to-read" },
          ],
        },
        {
          label: "Explanation — the why",
          items: [
            { label: "The document-architecture canon", slug: "explanation/canon" },
            { label: "Present / absent", slug: "explanation/present-absent" },
            { label: "Provenance & lineage", slug: "explanation/provenance" },
            { label: "The observability spine", slug: "explanation/observability" },
            { label: "The three pillars", slug: "explanation/three-pillars" },
          ],
        },
        {
          label: "Reference — the what",
          items: [
            { label: "Extraction schema", slug: "reference/schema" },
            { label: "Database schema", slug: "reference/database" },
            { label: "The worker pipeline", slug: "reference/pipeline" },
            { label: "Targeting modes", slug: "reference/targeting" },
            { label: "Confidence & telemetry", slug: "reference/confidence" },
          ],
        },
        {
          label: "How-to — a goal",
          items: [
            { label: "Run the extraction worker", slug: "how-to/run-worker" },
            { label: "Apply database migrations", slug: "how-to/migrations" },
            { label: "Add a paper & verify it", slug: "how-to/add-and-verify" },
          ],
        },
        {
          label: "Tutorials — learn by doing",
          items: [
            { label: "Extract your first paper", slug: "tutorials/first-extraction" },
          ],
        },
      ],
    }),
  ],
});
