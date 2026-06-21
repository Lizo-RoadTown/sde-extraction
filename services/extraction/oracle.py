"""The reproduction oracle — the BioModels curation harness, run as the verify seam.

This is the "run + same-results check" of the recorded transformation (memory:
reproduction-transformation-must-be-recorded). It takes the filled ExecutableModel (the BioModels
curation model — variables, parameters, ICs, and the executable drift_term/diffusion_term bodies) and
runs it through the EXACT diffrax harness from the curation template
(AT3_review/curation-dev/template/curation-template.ipynb, given by the head of BioModels for
reproducibility): MultiTerm(ODETerm drift, ControlTerm diffusion) over a VirtualBrownianTree with a
FIXED seed (PRNGKey), Euler solver, dt=(t1-t0)/1000, saved at 100 points.

The verdict is two-part and NEVER guessed (transform.ReproductionRecord.decide):
  1. ran_ok      — the curation model ran without error (ICs/params present, terms well-formed).
  2. same-results — running it TWICE at the same seed gives the SAME result hash (deterministic).
A fixed seed makes a correct model reproduce bit-for-bit; that hash match is the reproducibility proof.

diffrax/jax are imported lazily inside the run path so this module imports cleanly (pydantic-only) for
the schema guard, which has no diffrax installed.
"""
from __future__ import annotations

import hashlib
import textwrap
from typing import Optional

from transform import ExecutableModel, ReproductionRecord

# How many save points / the dt divisor — taken verbatim from the curation template so our run matches
# the curator's run exactly (same grid, same solver, same seed => same numbers).
SAVE_POINTS = 100
DT_DIVISOR = 1000


def _hash_array(arr) -> str:
    """SHA-256 of the simulation result's raw bytes — the fingerprint we compare across runs."""
    import numpy as np

    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()


def _compile_term(code: str, name: str):
    """Build drift_term/diffusion_term from the curation model's recorded body. The curation model IS
    executable Python (BioModels convention) — `code` is the function body, ending in a `return [...]`
    of length len(variable_names). jnp/jax/math are in scope, matching the template."""
    import math

    import jax
    from jax import numpy as jnp

    ns = {"jnp": jnp, "jax": jax, "math": math}
    body = code if (code and code.strip()) else "raise NotImplementedError"
    src = f"def {name}(t, y, p):\n" + textwrap.indent(body, "    ")
    exec(src, ns)  # noqa: S102 - the curation model is executable Python by design
    return ns[name]


def _simulate(model: ExecutableModel, seed: int):
    """One run of the curation harness — verbatim shape from curation-template.ipynb. Returns the
    saved trajectory as a numpy array (rows = times, cols = variables)."""
    import diffrax
    import jax
    import numpy as np
    from jax import numpy as jnp

    drift = _compile_term(model.drift_code, "drift_term")
    diffusion = _compile_term(model.diffusion_code, "diffusion_term")

    sim_times = np.linspace(model.initial_time, model.final_time, SAVE_POINTS)
    dt = (model.final_time - model.initial_time) / DT_DIVISOR
    dr_term = diffrax.ODETerm(lambda t, y, p: jnp.array(drift(t, y, p)))
    br_term = diffrax.VirtualBrownianTree(
        t0=model.initial_time, t1=model.final_time, tol=dt / 10, shape=(),
        key=jax.random.PRNGKey(seed),
    )
    di_term = diffrax.ControlTerm(lambda t, y, p: jnp.array(diffusion(t, y, p)), br_term)
    sde_terms = diffrax.MultiTerm(dr_term, di_term)
    solver = diffrax.Euler()
    ys = diffrax.diffeqsolve(
        sde_terms, solver,
        t0=model.initial_time, t1=model.final_time, dt0=dt,
        y0=jnp.asarray([model.initial_values[n] for n in model.variable_names]),
        args=jnp.asarray([model.parameter_values[n] for n in model.parameter_names]),
        saveat=diffrax.SaveAt(ts=jnp.asarray(sim_times)),
        max_steps=None, throw=True,
    ).ys
    return np.asarray(ys)


def run_reproduction(
    model: ExecutableModel, *, seed: int = 0, record: Optional[ReproductionRecord] = None,
) -> ReproductionRecord:
    """Run the curation model through the diffrax harness TWICE at the same seed and record the verdict.

    Records (never guesses): ran_ok, the two result hashes, the seed. Then ReproductionRecord.decide()
    turns those recorded facts into the verdict: errored => failed; same hash => reproduced; else failed.
    The curation-template up-front checks (ICs/params present) run first, recorded as ran_ok=False.
    """
    rec = record or ReproductionRecord()
    rec.model = model
    rec.seed = seed

    miss = model.missing()
    if miss["initial_values"] or miss["parameter_values"]:
        rec.ran_ok = False
        rec.note = f"curation check failed - missing: {miss}"
        return rec.decide()

    try:
        first = _simulate(model, seed)
        second = _simulate(model, seed)
        rec.ran_ok = True
        rec.result_sha256 = _hash_array(first)
        rec.rerun_sha256 = _hash_array(second)
    except Exception as e:  # noqa: BLE001 - any harness failure is an honest "failed", recorded
        rec.ran_ok = False
        rec.note = f"{type(e).__name__}: {e}"

    return rec.decide()
