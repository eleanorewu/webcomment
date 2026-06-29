-- 004_realtime.sql
-- Enable Supabase Realtime broadcast on the session channel.
-- No table replication needed — we use broadcast mode (client-side after write).
-- To allow broadcast from Extension clients, no additional config is required;
-- Supabase Realtime allows broadcast by default for channels not protected by JWT.
ALTER PUBLICATION supabase_realtime ADD TABLE review_sessions;
