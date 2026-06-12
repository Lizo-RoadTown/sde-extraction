import { useSyncExternalStore, type ReactNode } from "react";

// Minimal hash router — zero dependency. Hash URLs (#/queue, #/verify/:id) drive the
// browser's native history, so Back/Forward "just work" on Vercel static hosting with no
// server rewrite. Each view is a real, shareable, back-able URL — which is the whole point:
// in-memory state swaps (the old approach) lost the page on Back.

/** The current route path, e.g. "/", "/queue", "/verify/abc". */
export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Subscribe a component to the current route. Re-renders on Back/Forward and navigation. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => "/");
}

/** Programmatic navigation (pushes a history entry, so Back returns here). */
export function navigate(to: string): void {
  if (currentPath() === to) return;
  window.location.hash = to;
}

/** Match "/verify/:id" → the id, else null. */
export function matchVerify(path: string): string | null {
  const m = path.match(/^\/verify\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** An anchor that uses the hash router. Native <a> → browser history → Back works. */
export function Link({
  to,
  className,
  title,
  children,
}: {
  to: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a href={`#${to}`} className={className} title={title}>
      {children}
    </a>
  );
}
