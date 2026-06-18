-- Detected figures for the human chooser.
-- A 'detect' job runs the SAME server-side PyMuPDF detector used for extraction
-- (figures.detect_figures) and stores the real regions here. The Walkthrough renders each region
-- cropped from the PDF to the server's exact bbox and the human picks ONE. No ranking, no auto-pick —
-- the system finds the figures; the human chooses. The pick then drives a normal figure-mode extraction.
alter table papers add column if not exists detected_figures jsonb;
