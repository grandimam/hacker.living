-- Claiming a single job also reaps exhausted leases. Keep that maintenance
-- proportional to active workers instead of scanning millions of queued jobs.
CREATE INDEX pipeline_jobs_running_lease_idx ON pipeline_jobs(locked_until) WHERE state='running';
