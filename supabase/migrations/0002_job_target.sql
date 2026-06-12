-- Add the user's targeting choice to each extraction job (the Intake modes:
-- auto-detect figures / by figure / by model / whole paper). The worker's
-- processor branches on target.mode to build the OpenAI prompt.
--   { "mode": "auto"|"figure"|"model"|"whole", "figure_ref"?: string, "model_desc"?: string }
alter table extraction_jobs
  add column if not exists target jsonb not null default '{"mode":"auto"}'::jsonb;
