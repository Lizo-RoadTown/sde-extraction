import { useEffect, useState } from "react";
import { Card } from "../ui";
import { loadExtraction } from "../data";
import { Link } from "../router";
import { Detail } from "./Verify";
import type { FigureExtraction } from "../types";

// A single extraction as its own page (#/verify/:id) — opened from the Queue. Because it's
// a real URL, the browser Back button returns to the queue and the page survives a refresh.
export function VerifyPage({ id }: { id: string }) {
  const [ext, setExt] = useState<FigureExtraction | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    setExt(undefined);
    loadExtraction(id).then((e) => { if (!cancelled) setExt(e); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link to="/queue" className="self-start text-sm text-active hover:underline">← back to queue</Link>
      {ext === undefined ? (
        <Card className="py-10 text-center text-sm text-ink-faint">loading…</Card>
      ) : ext === null ? (
        <Card className="py-10 text-center text-sm text-ink-faint">
          That extraction couldn’t be found. It may have been removed.
        </Card>
      ) : (
        <Detail key={ext.id} ext={ext} />
      )}
    </div>
  );
}
