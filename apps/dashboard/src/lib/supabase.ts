import { createClient } from "@supabase/supabase-js";

// Env-gated: if Supabase isn't configured (e.g. local mock mode), the app falls back
// to mock data instead of crashing. Set these in .env.local and in Vercel project env.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
