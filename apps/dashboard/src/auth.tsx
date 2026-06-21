import { type ReactNode } from "react";

// AUTH IS OFF FOR NOW (Liz, 2026-06-21 — "we aren't protecting anything yet"). The login page is
// removed; the app is open. The DB side is opened to match (migration temp_open_anon_auth_off grants
// the anon role + adds 'anon_temp_full_access' RLS policies), so the site works without a session.
//
// TO RE-ENABLE PROTECTION later: restore the password gate below (see git history for the LoginForm /
// Gated version) AND drop the anon_temp_full_access policies + anon grants from the DB.
export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
