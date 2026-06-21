#!/usr/bin/env node
/**
 * clarify-gate.mjs — UserPromptSubmit hook.
 *
 * Injects the FRAMING-CLARIFICATION GATE on every turn so the assistant confirms WHAT it is building,
 * and WHERE it lives, BEFORE building — catching the recurring drift where a requested LAYER/tool gets
 * upgraded into a separate, standalone, deployed SYSTEM (the Dagster episode: operator asked for an
 * observability layer in the existing dashboard; assistant built + deployed a whole separate app).
 *
 * The point (operator's words): "the way I talk to you is missing some kind of prompt that lets you
 * understand something... Don't put the pressure on me to change, you need to filter for it." This is
 * that filter. Stdout from a UserPromptSubmit hook is added to the assistant's context.
 */
import { readFileSync } from "node:fs";

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no/!json stdin */ }
const prompt = String(payload.prompt || "").toLowerCase();

// Signals that the request is to ADD TO / LAYER INTO the existing app — not to build a new system.
const INTEGRATION =
  /\b(layer|part of|works with|work with|into|inside|alongside|add to|observability|workflow|deterministic|test branch|the site|the app|the dashboard|less llm|llm less|tab|integrat)\b/;

const gate = [
  "[sde-guard · framing gate] BEFORE you scaffold / deploy / create anything, POST these and WAIT for an explicit 'go':",
  "  1. Restate the request in the OPERATOR'S OWN WORDS — quote the load-bearing words (layer / part of / works with / into / observability / workflow / test branch).",
  "  2. ARTIFACT TYPE = {new system | layer in existing app | edit to existing file(s)}. Pick the SMALLEST that fits. Never default to the biggest.",
  "  3. WHERE it lives (the exact existing file / tab / surface) + what the USER sees. No host surface or no user value => STOP and ask; do not build.",
  "  4. Bind to the ROLE in the sentence, NOT a tool's default packaging (Dagster = a workflow/observability LAYER over the existing pipeline, not a new deployed app).",
  "  Never deploy an empty / zero-value scaffold. A 2nd deploy/DB error = STOP and re-ask 'is this the right artifact?', not debug-forward.",
];

if (INTEGRATION.test(prompt)) {
  gate.unshift(
    "[sde-guard · framing gate] This reads as ADD-TO / LAYER-INTO the existing app — NOT a new system. Default to integrating; confirm the framing in the operator's words before building.",
  );
}

process.stdout.write(gate.join("\n") + "\n");
process.exit(0);
