import { createClient } from "@supabase/supabase-js";

// Env-gated: if Supabase isn't configured (e.g. local mock mode), the app falls back
// to mock data instead of crashing. Set these in .env.local and in Vercel project env.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Two extraction paths run the SAME app over SEPARATE Postgres schemas (its own queue + results each):
//   public      → OpenAI / Pydantic            — the AI extraction, no workflow
//   dagster_app → Dagster + OpenAI / Pydantic   — the deterministic workflow orchestrating the AI
// The header path selector writes the choice to localStorage and reloads; default is public. The
// matching worker for each schema (APP_SCHEMA + EXTRACTION_ENGINE) drains that schema's queue.
export const PATHS = [
  { schema: "public", label: "OpenAI / Pydantic", blurb: "AI extraction · no workflow" },
  { schema: "dagster_app", label: "Dagster + OpenAI / Pydantic", blurb: "deterministic workflow over the AI" },
] as const;

export function activeSchema(): string {
  try {
    const s = localStorage.getItem("sde_db_schema");
    if (s && PATHS.some((p) => p.schema === s)) return s;
  } catch { /* no storage */ }
  return "public";
}

export function activePath() {
  return PATHS.find((p) => p.schema === activeSchema()) ?? PATHS[0];
}

export function setActiveSchema(schema: string): void {
  try { localStorage.setItem("sde_db_schema", schema); } catch { /* ignore */ }
  location.reload(); // re-create the client against the chosen schema
}

export const supabaseConfigured = Boolean(url && anonKey);

const schema = activeSchema();
export const supabase = supabaseConfigured
  ? createClient(url as string, anonKey as string, schema !== "public" ? { db: { schema } } : undefined)
  : null;
