-- 002_rls.sql
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_guests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;

-- Extract bearer token from the Authorization header
CREATE OR REPLACE FUNCTION current_bearer_token()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    regexp_replace(
      current_setting('request.headers', true)::json->>'authorization',
      '^[Bb]earer\s+', ''
    ), ''
  )
$$;

-- True if the caller's token is a valid owner or active guest token for sid
CREATE OR REPLACE FUNCTION has_session_read_access(sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM review_sessions s
    WHERE s.id = sid
      AND (
        s.owner_token_hash = encode(digest(current_bearer_token(), 'sha256'), 'hex')
        OR EXISTS (
          SELECT 1 FROM session_guests g
          WHERE g.session_id = sid
            AND g.status = 'active'
            AND g.token_hash = encode(digest(current_bearer_token(), 'sha256'), 'hex')
        )
      )
  )
$$;

-- True if caller has read access AND session status is 'active'
CREATE OR REPLACE FUNCTION has_session_write_access(sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM review_sessions s
    WHERE s.id = sid
      AND s.status = 'active'
      AND has_session_read_access(sid)
  )
$$;

-- review_sessions
CREATE POLICY "rs_read"   ON review_sessions FOR SELECT USING (has_session_read_access(id));
CREATE POLICY "rs_insert" ON review_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "rs_update" ON review_sessions FOR UPDATE USING (
  owner_token_hash = encode(digest(current_bearer_token(), 'sha256'), 'hex')
);

-- session_guests
CREATE POLICY "sg_read"   ON session_guests FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "sg_insert" ON session_guests FOR INSERT WITH CHECK (true);
CREATE POLICY "sg_update" ON session_guests FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM review_sessions s
    WHERE s.id = session_guests.session_id
      AND s.owner_token_hash = encode(digest(current_bearer_token(), 'sha256'), 'hex')
  )
);

-- pages
CREATE POLICY "pg_read"   ON pages FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "pg_insert" ON pages FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "pg_update" ON pages FOR UPDATE USING (has_session_write_access(session_id));

-- pins
CREATE POLICY "pin_read"   ON pins FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "pin_insert" ON pins FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "pin_update" ON pins FOR UPDATE USING (has_session_write_access(session_id));

-- threads
CREATE POLICY "th_read"   ON threads FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "th_insert" ON threads FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "th_update" ON threads FOR UPDATE USING (has_session_write_access(session_id));

-- comments (author check enforced in store.js before DELETE; RLS checks write access only)
CREATE POLICY "co_read"   ON comments FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "co_insert" ON comments FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "co_update" ON comments FOR UPDATE USING (has_session_write_access(session_id));
CREATE POLICY "co_delete" ON comments FOR DELETE USING (has_session_write_access(session_id));
