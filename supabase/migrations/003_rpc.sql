-- 003_rpc.sql
-- join_session verifies credentials server-side so password_hash is never sent to the client.
CREATE OR REPLACE FUNCTION join_session(
  p_session_id   uuid,
  p_invite_secret text,
  p_password      text,
  p_display_name  text
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session      review_sessions;
  v_guest_token  text;
  v_token_hash   text;
  v_guest_id     uuid;
  v_display_name text;
BEGIN
  SELECT * INTO v_session FROM review_sessions WHERE id = p_session_id;
  IF NOT FOUND        THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'session_closed'; END IF;

  IF encode(digest(p_invite_secret, 'sha256'), 'hex') != v_session.invite_secret_hash
    THEN RAISE EXCEPTION 'invalid_invite'; END IF;
  IF encode(digest(p_password, 'sha256'), 'hex') != v_session.password_hash
    THEN RAISE EXCEPTION 'wrong_password'; END IF;

  v_display_name := trim(regexp_replace(trim(p_display_name), '\s+', ' ', 'g'));
  IF length(v_display_name) = 0 THEN RAISE EXCEPTION 'display_name_required'; END IF;
  v_display_name := left(v_display_name, 80);

  -- Generate a 256-bit random guest token with prefix
  v_guest_token := 'guest_' || encode(gen_random_bytes(32), 'base64url');
  v_token_hash  := encode(digest(v_guest_token, 'sha256'), 'hex');

  INSERT INTO session_guests (session_id, display_name, token_hash, status)
  VALUES (p_session_id, v_display_name, v_token_hash, 'active')
  RETURNING id INTO v_guest_id;

  UPDATE review_sessions SET updated_at = now() WHERE id = p_session_id;

  RETURN json_build_object(
    'guestId',     v_guest_id,
    'guestToken',  v_guest_token,
    'displayName', v_display_name
  );
END;
$$;
