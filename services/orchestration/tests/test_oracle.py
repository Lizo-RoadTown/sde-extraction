"""The reproduction oracle, exercised on a KNOWN SDE — a genuine diffrax run, not a stub.

Proves the two-part verdict end to end: a well-formed curation model run twice at a fixed seed
reproduces bit-for-bit (status 'reproduced'); a model missing a parameter or with broken term code is
honestly 'failed'. This is the real determinism check that backs the pipeline's verify node.
"""
import sys
from pathlib import Path

# Same path-shim as the pipeline: the real machinery lives in ../extraction.
_EXTRACTION = Path(__file__).resolve().parents[1].parent / "extraction"
if str(_EXTRACTION) not in sys.path:
    sys.path.insert(0, str(_EXTRACTION))

import oracle  # noqa: E402
from transform import ExecutableModel  # noqa: E402


def _ou_model(**overrides) -> ExecutableModel:
    """A 1-variable mean-reverting (Ornstein-Uhlenbeck-like) SDE: dx = -a x dt + b dW."""
    fields = dict(
        variable_names=["x"],
        parameter_names=["a", "b"],
        initial_values={"x": 1.0},
        parameter_values={"a": 1.0, "b": 0.5},
        initial_time=0.0,
        final_time=1.0,
        drift_code="return [-p[0] * y[0]]",
        diffusion_code="return [p[1]]",
    )
    fields.update(overrides)
    return ExecutableModel(**fields)


def test_known_model_reproduces():
    rec = oracle.run_reproduction(_ou_model(), seed=0)
    assert rec.ran_ok is True
    assert rec.result_sha256 and rec.result_sha256 == rec.rerun_sha256  # same results each time
    assert rec.status == "reproduced"
    assert rec.figure_reproduced is True


def test_missing_parameter_fails():
    rec = oracle.run_reproduction(_ou_model(parameter_values={"a": 1.0}), seed=0)  # 'b' missing
    assert rec.ran_ok is False
    assert rec.status == "failed"
    assert rec.figure_reproduced is False


def test_broken_term_code_fails():
    rec = oracle.run_reproduction(_ou_model(drift_code="return [1 / 0]"), seed=0)
    assert rec.ran_ok is False
    assert rec.status == "failed"
