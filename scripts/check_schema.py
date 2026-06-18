#!/usr/bin/env python3
"""The schema guard (ADR 0007, step 4). MUST pass before any schema change ships.

What it does — the determinism web applied to the schema itself:
  1. IMPORT every extraction module — catches a bad name (the `FigurePanels` crash that
     loop-killed the worker for two days would have failed HERE, before deploy).
  2. CONSTRUCT every Pydantic model — catches a broken field/shape.
  3. LOAD every registry (families / variable roles / parameter roles) — catches registry breakage.
  4. CHECK the producer↔consumer contract — the FigureExtraction top-level fields the dashboard
     reads must all be present (a lightweight contract test until TS is generated from Pydantic).

Run: python scripts/check_schema.py   (exit 0 = safe to ship; non-zero = do not ship)

Third-party deps absent in this env (psycopg / pdfplumber / openai / fitz / PIL / supabase) are
SKIPPED, not failed — but a bad NAME (ImportError: cannot import name ...) always fails, which is
exactly the class of bug this guard exists to catch.
"""
from __future__ import annotations

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXTRACT = os.path.join(HERE, "..", "services", "extraction")
sys.path.insert(0, os.path.abspath(EXTRACT))

THIRD_PARTY = {"psycopg", "pdfplumber", "openai", "fitz", "PIL", "supabase", "dotenv"}
fails: list[str] = []
skips: list[str] = []


def try_import(mod: str) -> bool:
    try:
        importlib.import_module(mod)
        print(f"  ok    import {mod}")
        return True
    except ModuleNotFoundError as e:
        missing = (e.name or "").split(".")[0]
        if missing in THIRD_PARTY:
            print(f"  skip  import {mod}  (dep '{missing}' not in this env)")
            skips.append(f"{mod} (dep {missing})")
            return False
        fails.append(f"import {mod}: {type(e).__name__}: {e}")
        print(f"  FAIL  import {mod}: {e}")
        return False
    except Exception as e:  # noqa: BLE001 — ImportError of a NAME, NameError, etc. = real breakage
        fails.append(f"import {mod}: {type(e).__name__}: {e}")
        print(f"  FAIL  import {mod}: {type(e).__name__}: {e}")
        return False


def main() -> int:
    print("[1/4] imports")
    # Pure-schema modules (only need pydantic) — these MUST import. processor only needs schema at
    # module load (openai/locator are lazy), so it surfaces FigurePanels-class name errors here.
    for m in ("schema", "classification", "contracts", "facets", "graph", "figures", "processor"):
        try_import(m)
    # Wiring modules — import if their deps exist; a bad NAME still fails (not skipped).
    for m in ("db", "hooks", "assemble", "locator", "worker"):
        try_import(m)

    print("[2/4] construct models")
    try:
        import schema as s
        absent = s.Absent(status="absent", reason=s.AbsenceReason.not_stated)
        present = s.Present(status="present", value="0.5", meaning="x", quote="x=0.5", page=1)
        s.Variable(symbol="S", meaning=present, initial_value=absent)
        s.Parameter(symbol="beta", value=present, meaning=present, units=absent)
        s.Term(variable="S", expression=present)
        fx = s.FigureExtraction(
            figure_label="Fig 1", figure_type="realizations", outcome="successful", pathogen="dengue",
            variables=[], parameters=[], drift_terms=[], diffusion_terms=[],
            time_span=s.TimeSpan(initial_time=absent, final_time=absent),
        )
        print("  ok    schema models construct")
    except Exception as e:  # noqa: BLE001
        fails.append(f"construct schema models: {type(e).__name__}: {e}")
        print(f"  FAIL  construct schema models: {e}")
        fx = None

    try:
        import facets as fc
        assert len(fc.FACETS) > 0, "FACETS is empty"
        # a controlled tag with a real concept validates; a bogus value does not
        assert fc.validate_tag(fc.Tag(facet="model-family", value="levy-jump"))
        assert not fc.validate_tag(fc.Tag(facet="model-family", value="nope"))
        assert fc.validate_tag(fc.Tag(facet="author", value="Smith J"))  # free facet
        assert fc.validate_tag(fc.Tag(facet="model-family", value="brand-new", value_is_new=True))
        print(f"  ok    facets: {len(fc.FACETS)} facets; tag validation works")
    except Exception as e:  # noqa: BLE001
        fails.append(f"facets: {type(e).__name__}: {e}")
        print(f"  FAIL  facets: {e}")

    try:
        import graph as g
        assert len(g.NODE_KINDS) > 0 and len(g.EDGE_TYPES) > 0, "graph vocabularies empty"
        # every edge type has an endpoint spec, and validate_edge enforces allowed kinds
        assert set(g.EDGE_ENDPOINTS) == set(g.EDGE_TYPES), "EDGE_ENDPOINTS != EDGE_TYPES"
        assert g.validate_edge(g.GraphEdge(source="paper:1", target="model:1", type="contains"))
        assert not g.validate_edge(g.GraphEdge(source="model:1", target="paper:1", type="contains"))
        # the per-piece composite id 'variable:<extraction_id>:<symbol>' must still read as kind 'variable'
        # (migration 0010's jsonb branches depend on this — kind is the prefix before the FIRST colon)
        assert g.kind_of("variable:abc-123:S") == "variable"
        assert g.validate_edge(g.GraphEdge(source="variable:abc-123:S", target="model:abc-123", type="attached-to"))
        assert not g.validate_edge(g.GraphEdge(source="model:abc-123", target="variable:abc-123:S", type="attached-to"))
        print(f"  ok    graph: {len(g.NODE_KINDS)} node kinds, {len(g.EDGE_TYPES)} edge types; edge + composite-id validation works")
    except Exception as e:  # noqa: BLE001
        fails.append(f"graph: {type(e).__name__}: {e}")
        print(f"  FAIL  graph: {e}")

    try:
        import figures as fig
        assert fig.norm_label("Figure 2") == "2" and fig.norm_label("FIG. 3a") == "3a"
        assert fig.CAPTION.search("see Figure 12 for details") is not None
        r = fig.FigureRegion(page=1, bbox=(0, 0, 10, 10), bbox_norm=(0, 0, 0.1, 0.1), area=100.0)
        fig.FigureProvenance(tool="pymupdf", page=1, bbox=r.bbox, bbox_norm=r.bbox_norm, scale=2.0)
        print("  ok    figures: caption/label parse + region/provenance models construct")
    except Exception as e:  # noqa: BLE001
        fails.append(f"figures: {type(e).__name__}: {e}")
        print(f"  FAIL  figures: {e}")

    try:
        import classification as c
        c.ModelClassification(family_name="levy-jump")
        c.VariableClassification(symbol="S", role="susceptible")
        c.ParameterClassification(symbol="sigma", role="noise-intensity", disposition="extract")
        c.ClassificationCandidate(kind="variable_role", proposed_name="quarantined")
        print("  ok    classification models construct")
    except Exception as e:  # noqa: BLE001
        fails.append(f"construct classification models: {type(e).__name__}: {e}")
        print(f"  FAIL  construct classification models: {e}")

    print("[3/4] registries non-empty + match-or-add works")
    try:
        import classification as c
        for name, reg in (("FORMULATION_FAMILIES", c.FORMULATION_FAMILIES),
                          ("VARIABLE_ROLES", c.VARIABLE_ROLES),
                          ("PARAMETER_ROLES", c.PARAMETER_ROLES)):
            assert len(reg) > 0, f"{name} is empty"
            print(f"  ok    {name}: {len(reg)} entries")
        assert c.match_family("levy-jump") and c.match_role("susceptible") and c.match_parameter_role("noise-intensity")
        assert c.match_family("does-not-exist") is None  # unknown -> propose-new, not a false match
        print("  ok    match-or-add resolves known + rejects unknown")
    except Exception as e:  # noqa: BLE001
        fails.append(f"registries: {type(e).__name__}: {e}")
        print(f"  FAIL  registries: {e}")

    print("[4/4] producer-consumer contract (FigureExtraction fields)")
    # The snake_case fields the dashboard's rowToExtraction reads. If the schema drops/renames one,
    # the dashboard silently mis-maps — this catches it until TS is generated from Pydantic.
    expected = {"figure_label", "figure_type", "outcome", "pathogen",
                "variables", "parameters", "drift_terms", "diffusion_terms", "time_span"}
    try:
        import schema as s
        actual = set(s.FigureExtraction.model_fields.keys())
        missing = expected - actual
        assert not missing, f"FigureExtraction missing contract fields: {missing}"
        print(f"  ok    all {len(expected)} contract fields present")
    except Exception as e:  # noqa: BLE001
        fails.append(f"contract: {type(e).__name__}: {e}")
        print(f"  FAIL  contract: {e}")

    print("\n" + ("=" * 60))
    if skips:
        print(f"skipped (deps not in this env): {len(skips)}")
    if fails:
        print(f"GUARD FAILED — {len(fails)} problem(s); DO NOT SHIP:")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("GUARD PASSED — schema imports, constructs, registries, and contract all hold.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
