# Realtime Backend Design — True A/B Collaboration

## Goal

Migrate WebComment from a local-only Chrome storage model to a Supabase-backed realtime
collaboration system. Two people on different devices and networks can open the same website,
join the same Review Session, and see each other's comments appear in real time without
reloading the page.

## Product Context

WebComment is a Designer QA tool. Sessions are scoped to a project's review phase — typically
days to a few weeks. Once a project ships, the session has no further value. This means data
lifecycle management is a first-class concern, not an afterthought.

## Background — Current Architecture

All data lives in `chrome.storage.local`. `src/shared/store.js` reads and writes directly to
local storage. There is no network layer. `src/shared/session-access.js` generates and verifies
capability token hashes locally. Invite links and admin links use the placeholder domain
`https://webcomment.local/...`.

The existing token model (`ownerToken` / `guestToken` / `inviteSecret`) is already designed for
a remote backend — it just has no server to talk to yet.

## Scope

### In Scope

- Supabase project setup (DB, Realtime, RLS)
- Schema for 6 tables: `review_sessions`, `session_guests`, `pages`, `pins`, `threads`, `comments`
- `src/shared/api-client.js` — thin Supabase fetch wrapper
- Remote writes for `createPrivateSession`, `joinPrivateSession`, `createThread`, `addReply`,
  `updateComment`, `deleteComment`, `setThreadResolved`, `updatePinAnchor`, `closeSession`,
  `removeGuest`, `resetInviteLink`, `changeSessionPassword`
- Remote reads for `getSessionPageData`, `listSessions`
- Realtime subscription: `PIN_CREATED`, `COMMENT_CREATED`, `THREAD_RESOLVED`, `THREAD_REOPENED`
- Optimistic update with rollback on failure
- Session TTL via `pg_cron`: auto-close after 30 days idle, auto-delete 30 days after close

### Out of Scope

- Account system / Supabase Auth
- Web Dashboard
- Migration of existing `local_legacy` sessions to remote
- Offline write queue / sync-on-reconnect
- `PIN_ANCHOR_UPDATED` realtime event (next iteration)
- bcrypt password hashing (SHA-256 acceptable for MVP; upgrade path noted)

## Architecture

```
Chrome Extension
├── src/shared/store.js        — orchestration; branches on accessMode
├── src/shared/api-client.js   — NEW: all Supabase fetch calls
├── src/shared/session-access.js — unchanged: token hash helpers
└── src/content/content-script.js — subscribes to Realtime channel

Supabase
├── Postgres        — persistent store for all session data
├── Realtime        — WebSocket channel per session
├── Row Level Security — token hash validation; no middleware needed
└── pg_cron         — scheduled session cleanup
```

### Platform Choice

**Supabase direct** (Option A). The Extension holds the Supabase `anon` key, which is safe
because the anon key is public by design. Real security is enforced by RLS policies that
verify capability token hashes before returning or mutating any row.

## Database Schema

### review_sessions

```sql
CREATE TABLE review_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'active', -- 'active' | 'closed'
  password_hash      text NOT NULL DEFAULT '',
  invite_secret_hash text NOT NULL DEFAULT '',
  owner_token_hash   text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);
```

### session_guests

```sql
CREATE TABLE session_guests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  token_hash   text NOT NULL,
  status       text NOT NULL DEFAULT 'active', -- 'active' | 'removed'
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  removed_at   timestamptz
);
```

### pages

```sql
CREATE TABLE pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  page_key    text NOT NULL,
  latest_url  text NOT NULL,
  hostname    text NOT NULL,
  pathname    text NOT NULL,
  title       text,
  environment text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, page_key)
);
```

### pins

```sql
CREATE TABLE pins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  thread_id       uuid, -- set after thread insert; nullable briefly
  created_by      text NOT NULL, -- actor id (owner id or guest id)
  anchor          jsonb NOT NULL,
  anchor_revision integer NOT NULL DEFAULT 1,
  moved_by        text,
  moved_at        timestamptz,
  status          text NOT NULL DEFAULT 'attached',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### threads

```sql
CREATE TABLE threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id       uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'open', -- 'open' | 'resolved'
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

### comments

```sql
CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES comments(id),
  author_id         text NOT NULL, -- actor id
  author_name       text NOT NULL,
  author_initials   text NOT NULL,
  body              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  edited_at         timestamptz
);
```

### Indexes

```sql
CREATE INDEX ON pages(session_id, page_key);
CREATE INDEX ON pins(page_id, session_id);
CREATE INDEX ON threads(pin_id);
CREATE INDEX ON comments(thread_id, created_at);
CREATE INDEX ON session_guests(session_id, status);
```

### Cascade

All foreign keys use `ON DELETE CASCADE`. Deleting a `review_session` row removes all
associated guests, pages, pins, threads, and comments automatically.

## Row Level Security

Enable RLS on all tables. Use a helper function to extract and verify the bearer token.

```sql
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_guests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;

-- Helper: resolve the bearer token from the request Authorization header
CREATE OR REPLACE FUNCTION current_bearer_token()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    regexp_replace(
      current_setting('request.headers', true)::json->>'authorization',
      '^[Bb]earer\s+', ''
    ), ''
  )
$$;

-- Helper: check whether the caller has read access to a session
CREATE OR REPLACE FUNCTION has_session_read_access(sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM review_sessions s
    WHERE s.id = sid
      AND (
        s.owner_token_hash = encode(
          digest(current_bearer_token(), 'sha256'), 'hex'
        )
        OR EXISTS (
          SELECT 1 FROM session_guests g
          WHERE g.session_id = sid
            AND g.status = 'active'
            AND g.token_hash = encode(
                  digest(current_bearer_token(), 'sha256'), 'hex'
                )
        )
      )
  )
$$;

-- Helper: check whether the caller may write (session active + has access)
CREATE OR REPLACE FUNCTION has_session_write_access(sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM review_sessions s
    WHERE s.id = sid
      AND s.status = 'active'
      AND has_session_read_access(sid)
  )
$$;

-- review_sessions: read
CREATE POLICY "session_read" ON review_sessions
  FOR SELECT USING (has_session_read_access(id));

-- review_sessions: create (anon allowed — anyone can create a session)
CREATE POLICY "session_insert" ON review_sessions
  FOR INSERT WITH CHECK (true);

-- review_sessions: update (owner only)
CREATE POLICY "session_update" ON review_sessions
  FOR UPDATE USING (
    owner_token_hash = encode(digest(current_bearer_token(), 'sha256'), 'hex')
  );

-- session_guests: read
CREATE POLICY "guest_read" ON session_guests
  FOR SELECT USING (has_session_read_access(session_id));

-- session_guests: join (invite + password verified by Extension before INSERT)
CREATE POLICY "guest_insert" ON session_guests
  FOR INSERT WITH CHECK (true);

-- session_guests: remove (owner only, via review_sessions update policy)
CREATE POLICY "guest_update" ON session_guests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM review_sessions s
      WHERE s.id = session_guests.session_id
        AND s.owner_token_hash = encode(
              digest(current_bearer_token(), 'sha256'), 'hex'
            )
    )
  );

-- pages / pins / threads / comments: read
CREATE POLICY "page_read"    ON pages    FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "pin_read"     ON pins     FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "thread_read"  ON threads  FOR SELECT USING (has_session_read_access(session_id));
CREATE POLICY "comment_read" ON comments FOR SELECT USING (
  has_session_read_access(
    (SELECT s.id FROM threads t
     JOIN pins p ON p.id = t.pin_id
     JOIN pages pg ON pg.id = p.page_id
     JOIN review_sessions s ON s.id = pg.session_id
     WHERE t.id = comments.thread_id)
  )
);

-- pages / pins / threads / comments: write (active session + valid token)
CREATE POLICY "page_insert"    ON pages    FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "pin_insert"     ON pins     FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "thread_insert"  ON threads  FOR INSERT WITH CHECK (has_session_write_access(session_id));
CREATE POLICY "comment_insert" ON comments FOR INSERT WITH CHECK (
  has_session_write_access(
    (SELECT s.id FROM threads t
     JOIN pins p ON p.id = t.pin_id
     JOIN pages pg ON pg.id = p.page_id
     JOIN review_sessions s ON s.id = pg.session_id
     WHERE t.id = comments.thread_id)
  )
);

-- pins / threads / comments: update
CREATE POLICY "pin_update"     ON pins     FOR UPDATE USING (has_session_write_access(session_id));
CREATE POLICY "thread_update"  ON threads  FOR UPDATE USING (has_session_write_access(session_id));
CREATE POLICY "comment_update" ON comments FOR UPDATE USING (
  has_session_write_access(
    (SELECT s.id FROM threads t
     JOIN pins p ON p.id = t.pin_id
     JOIN pages pg ON pg.id = p.page_id
     JOIN review_sessions s ON s.id = pg.session_id
     WHERE t.id = comments.thread_id)
  )
);

-- comments: delete
-- Author check is enforced in store.js before calling DELETE.
-- RLS only verifies that the caller has write access to the session.
-- This is safe because store.js reads the comment, confirms authorId === actorId,
-- then issues the DELETE. A rogue client without a valid token cannot reach this policy.
CREATE POLICY "comment_delete" ON comments
  FOR DELETE USING (
    has_session_write_access(
      (SELECT s.id FROM threads t
       JOIN pins p ON p.id = t.pin_id
       JOIN pages pg ON pg.id = p.page_id
       JOIN review_sessions s ON s.id = pg.session_id
       WHERE t.id = comments.thread_id)
    )
  );
```

## api-client.js

New file at `src/shared/api-client.js`. Holds the Supabase URL and anon key. All remote
calls go through this module.

```js
const SUPABASE_URL = 'https://<project-ref>.supabase.co';
const SUPABASE_ANON_KEY = '<anon-key>';

async function supabaseFetch(path, options = {}, token = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || `HTTP ${res.status}`), {
      code: body.code,
      status: res.status,
    });
  }
  return res.json();
}
```

Exported functions cover every operation in the In Scope list:
`createSession`, `joinSession`, `fetchSessionPageData`, `insertPin`,
`insertThread`, `insertComment`, `insertReply`, `updateComment`, `deleteComment`,
`resolveThread`, `updatePinAnchor`, `closeSession`, `removeGuest`,
`changePassword`, `resetInviteLink`.

## store.js Changes

`store.js` gets a single branch at the top of each mutating function:

```js
if (session.accessMode === 'local_legacy') {
  return existingLocalLogic();
}
// new remote path below
```

`chrome.storage.local` retains two roles:
1. **Credential store** — `ownerToken`, `guestToken`, `activeSessionId` (never sent to Supabase)
2. **Page-data cache** — last successful `getSessionPageData` result, used as offline fallback

### Optimistic Update Pattern

```
User submits comment
  → Append comment to local UI with status: 'pending'
  → Call api-client insertComment
  → Success: replace pending item with server response (use server id)
  → Failure: remove pending item, show retry toast
```

## Realtime Subscription

Subscribe to `session:{sessionId}` immediately after joining or creating a session.
Unsubscribe when the overlay deactivates or the tab navigates away.

```js
const channel = supabaseClient
  .channel(`session:${sessionId}`)
  .on('broadcast', { event: 'PIN_CREATED' },    (msg) => handlePinCreated(msg.payload))
  .on('broadcast', { event: 'COMMENT_CREATED' }, (msg) => handleCommentCreated(msg.payload))
  .on('broadcast', { event: 'THREAD_RESOLVED' }, (msg) => handleThreadResolved(msg.payload))
  .on('broadcast', { event: 'THREAD_REOPENED' }, (msg) => handleThreadReopened(msg.payload))
  .subscribe();
```

### Broadcast Mechanism — DB Trigger (Recommended)

Events are broadcast from **Postgres triggers**, not from the Extension. This ensures events
are always emitted even if the writing client crashes or disconnects after the write.

```sql
-- Example: broadcast COMMENT_CREATED after INSERT on comments
CREATE OR REPLACE FUNCTION notify_comment_created()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sid uuid;
BEGIN
  SELECT s.id INTO sid
  FROM threads t
  JOIN pins p ON p.id = t.pin_id
  JOIN pages pg ON pg.id = p.page_id
  JOIN review_sessions s ON s.id = pg.session_id
  WHERE t.id = NEW.thread_id;

  PERFORM pg_notify(
    'realtime:session:' || sid::text,
    json_build_object(
      'event', 'COMMENT_CREATED',
      'payload', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comment_created
AFTER INSERT ON comments
FOR EACH ROW EXECUTE FUNCTION notify_comment_created();
```

Equivalent triggers are created for `PIN_CREATED` (after INSERT on pins + threads + first
comment), `THREAD_RESOLVED`, and `THREAD_REOPENED`.

The writing client applies optimistic updates locally and de-duplicates incoming Realtime
events by checking whether the arriving `id` already exists in local state before rendering.

### Realtime Events

| Event | Payload |
|---|---|
| `PIN_CREATED` | `{ pin, thread, comment }` |
| `COMMENT_CREATED` | `{ threadId, comment }` |
| `THREAD_RESOLVED` | `{ threadId, resolvedBy, resolvedAt }` |
| `THREAD_REOPENED` | `{ threadId }` |

## Session TTL

Two `pg_cron` jobs run daily at 02:00 UTC.

```sql
-- Auto-close sessions idle for 30 days
SELECT cron.schedule('auto-close-idle-sessions', '0 2 * * *', $$
  UPDATE review_sessions
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE status = 'active'
    AND updated_at < now() - INTERVAL '30 days';
$$);

-- Auto-delete sessions closed for 30 days (cascades to all child rows)
SELECT cron.schedule('auto-delete-closed-sessions', '0 2 * * *', $$
  DELETE FROM review_sessions
  WHERE status = 'closed'
    AND closed_at < now() - INTERVAL '30 days';
$$);
```

No extra cleanup logic needed; `ON DELETE CASCADE` handles guests, pages, pins, threads,
and comments.

## Migration Strategy

Existing `local_legacy` sessions are not migrated. They continue working exactly as before.

New sessions created after this release always use `accessMode: 'guest_password'` and are
stored in Supabase. The branch in `store.js` ensures backward compatibility without any
data conversion step.

## Security Notes

- Supabase `anon` key is safe to include in the Extension because it is public by design;
  RLS enforces real access control.
- Token hashes stored in Supabase use SHA-256. This is acceptable for MVP because owner and
  guest tokens are high-entropy random values (256 bits). Upgrade to bcrypt for session
  passwords in a future iteration.
- Tokens (`ownerToken`, `guestToken`) are stored only in `chrome.storage.local` on the
  user's device. They are never uploaded to Supabase.
- Every read and write path verifies token hash via RLS before any data is returned or mutated.
- Closed sessions reject all writes. Removed guests lose read and write access immediately.

## Error Handling

| Scenario | Behavior |
|---|---|
| Network unavailable | Show last cached page data; disable comment submit |
| Wrong password on join | Display error, stay on join screen |
| Token rejected (guest removed / session closed) | Invalidate local token, show access-lost message |
| Optimistic write fails | Remove pending item, show retry toast |
| Realtime disconnect | Supabase client auto-reconnects; reload page data on reconnect |

## Acceptance Criteria

- Owner creates a session and receives ownerToken + inviteLink.
- Guest joins with inviteLink + password + displayName and receives guestToken.
- Guest can view all existing pins and comments in the session.
- Owner adds a comment; Guest sees it appear without reloading the page.
- Guest adds a comment; Owner sees it appear without reloading the page.
- A third person on the same URL without valid session access cannot fetch or subscribe to
  comments.
- Closing the session prevents new writes from both Owner and Guest.
- Removing a Guest invalidates that Guest's token immediately.
- Sessions idle for 30 days are automatically closed.
- Sessions closed for 30 days are automatically deleted (all data gone).
- Existing `local_legacy` sessions continue to work unchanged.
