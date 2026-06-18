// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

// SDE Extraction documentation (Astro Starlight). Public site for a scientist reviewing a paper:
// what the system reads out of a paper, and how to check and reproduce it. Plain language, no
// programmer/AI jargon, no internal decisions/ADRs (those live in the repo docs/ tree).
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
            { label: "Open the app ↗", link: "https://sde-extraction.vercel.app/", attrs: { target: "_blank", rel: "noreferrer" } },
            { label: "Overview", slug: "index" },
            { label: "Follow a paper, step by step", slug: "start/reproduce" },
            { label: "How to read this", slug: "start/how-to-read" },
          ],
        },
        {
          label: "How it works",
          items: [
            { label: "What it recognizes", slug: "explanation/recognizes" },
            { label: "Where each value comes from", slug: "explanation/provenance" },
            { label: "The structured map", slug: "reference/schema" },
            { label: "Watch it work", slug: "explanation/observability" },
          ],
        },
        {
          label: "Use it",
          items: [
            { label: "Add a paper and check it", slug: "how-to/add-and-verify" },
          ],
        },
      ],
    }),
  ],
});
