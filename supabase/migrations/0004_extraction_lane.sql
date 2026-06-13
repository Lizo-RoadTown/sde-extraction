-- Lane separation: which audience lane produced an extraction.
-- 'walkthrough' (guided, front page) vs 'bulk' (power-user queue). NULL = legacy → treated as bulk.
-- The worker copies the lane from the job's target.lane onto the extraction so the Bulk queue
-- can show only bulk-lane work (Walkthrough papers are handled inline and don't clutter Bulk).
alter table extractions add column if not exists lane text;
create index if not exists extractions_lane_idx on extractions(lane);
