ALTER TABLE font_runs ADD COLUMN worker_limit integer NOT NULL DEFAULT 2 CHECK(worker_limit BETWEEN 1 AND 32);
