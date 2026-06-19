# Dagster webserver image for the SDE_Extraction orchestrator (skeleton deploy).
#
# IMPORTANT: build context is the REPO ROOT, not services/orchestration. The orchestration project
# imports the real machinery from ../extraction (schema, classification, transform, figures) via the
# path-shim in defs/pipeline.py, so BOTH service dirs must be present with the repo's relative layout.
# In render.yaml this service sets dockerContext: . and dockerfilePath: ./services/orchestration/Dockerfile.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DAGSTER_HOME=/opt/dagster/home \
    UV_LINK_MODE=copy

# uv for fast, locked installs (pinned to match the dev toolchain)
COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /usr/local/bin/uv

WORKDIR /app/services/orchestration

# Copy both services so the ../extraction import shim resolves at runtime.
COPY services/extraction /app/services/extraction
COPY services/orchestration /app/services/orchestration

# Install the locked runtime deps (excludes the dev-only dg CLI).
RUN uv sync --frozen --no-dev

# Place the instance config where Dagster looks for it.
RUN mkdir -p "$DAGSTER_HOME" && cp dagster.yaml "$DAGSTER_HOME/dagster.yaml"

EXPOSE 3000
# Render injects $PORT for web services; bind the webserver to it.
CMD ["sh", "-c", "uv run --no-dev dagster-webserver -h 0.0.0.0 -p ${PORT:-3000} -w workspace.yaml"]
