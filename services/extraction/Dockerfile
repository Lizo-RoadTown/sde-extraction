# Extraction worker — a background worker (no inbound traffic): polls the Supabase
# extraction_jobs queue and runs the OpenAI+Pydantic present/absent extractor.
# Portable image — runs locally (docker compose), on Render (background worker), or
# any container host. Mirrors the proves worker container shape.
FROM python:3.12-slim

WORKDIR /app

# deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# worker source (db.py, processor.py, worker.py, schema.py)
COPY . .

# unbuffered logs so the worker's prints stream in container logs
ENV PYTHONUNBUFFERED=1

CMD ["python", "worker.py", "--daemon"]
