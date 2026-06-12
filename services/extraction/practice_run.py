"""Practice run: extract one local PDF for real (one OpenAI call), print the
present/absent result + per-piece hashes. Lets us see what the schema actually
captures on a real paper and tighten schema.py / the prompt from reality.

Usage:  python practice_run.py "path/to/paper.pdf" ["Figure 2"]
Loads OPENAI_API_KEY from .env (this dir or repo root), same as worker.py.
"""

from __future__ import annotations

import json
import os
import sys

# load .env (this dir → repo root), before importing processor (which reads the key)
try:
    from dotenv import load_dotenv
    _here = os.path.dirname(os.path.abspath(__file__))
    for _p in (os.path.join(_here, ".env"), os.path.join(_here, "..", "..", ".env")):
        if os.path.exists(_p):
            load_dotenv(_p, override=False)
            break
except ImportError:
    pass

import processor


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    pdf_path = sys.argv[1]
    figure = sys.argv[2] if len(sys.argv) > 2 else "(auto)"
    target = {"mode": "figure", "figure_ref": figure} if figure != "(auto)" else {"mode": "auto"}

    # processor.run downloads from a URL; for a local file, hand it a file:// URL.
    abspath = os.path.abspath(pdf_path)
    file_url = "file:///" + abspath.replace("\\", "/")

    print(f"Extracting: {pdf_path}\n  figure={figure!r}  model={processor.MODEL}\n")
    result = processor.run(pdf_url=file_url, figure_label=figure, target=target, no_llm=False)

    print("=== EXTRACTED MODEL (present/absent) ===")
    print(json.dumps(result["model"], indent=2))
    print("\n=== PER-PIECE HASHES (the fingerprint pieces) ===")
    for path, sha in result["checksums"].items():
        print(f"  {path:32s} {sha[:16]}…")


if __name__ == "__main__":
    main()
