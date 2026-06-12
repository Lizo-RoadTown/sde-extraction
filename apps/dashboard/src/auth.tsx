import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./lib/supabase";

// The gate. In mock mode (no Supabase) it's transparent — no login required.
export function AuthGate({ children }: { children: ReactNode }) {
  if (!supabaseConfigured || !supabase) return <>{children}</>;
  return <Gated>{children}</Gated>;
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center text-ink-dim">{children}</div>;
}

function Gated({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Centered>Loading…</Centered>;
  if (!session) return <LoginForm />;
  return <>{children}</>;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <Centered>
      <form onSubmit={signIn} className="flex w-72 flex-col gap-3 rounded-lg border border-edge bg-surface-raised/50 p-6">
        <div className="text-center">
          <div className="text-sm font-semibold text-active">SDE Extraction</div>
          <div className="text-xs text-ink-faint">single team · sign in</div>
        </div>
        <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-edge bg-inset/60 px-3 py-2 text-sm text-ink" />
        <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-edge bg-inset/60 px-3 py-2 text-sm text-ink" />
        {error && <div className="text-xs text-invalid">{error}</div>}
        <button type="submit" disabled={busy}
          className="rounded-md bg-active-soft py-2 text-sm text-active hover:bg-active-soft disabled:opacity-50">
          {busy ? "…" : "Sign in"}
        </button>
      </form>
    </Centered>
  );
}
