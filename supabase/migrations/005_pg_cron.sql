-- 005_pg_cron.sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Auto-close sessions idle for 30 days
SELECT cron.schedule(
  'auto-close-idle-sessions',
  '0 2 * * *',
  $$
    UPDATE review_sessions
    SET status = 'closed', closed_at = now(), updated_at = now()
    WHERE status = 'active'
      AND updated_at < now() - INTERVAL '30 days';
  $$
);

-- Auto-delete sessions closed for 30+ days (cascades all child rows)
SELECT cron.schedule(
  'auto-delete-closed-sessions',
  '0 2 * * *',
  $$
    DELETE FROM review_sessions
    WHERE status = 'closed'
      AND closed_at < now() - INTERVAL '30 days';
  $$
);
