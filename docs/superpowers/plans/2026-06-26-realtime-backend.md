# Realtime Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chrome.storage-only data layer with Supabase Postgres + Realtime so two people on different devices can join the same Review Session and see each other's comments in real time.

**Architecture:** Extension calls Supabase REST API directly for all reads and writes. After each successful write the Extension broadcasts an event to a Supabase Realtime channel; all other subscribers receive the event and update their local UI without reloading. `chrome.storage.local` is kept as credential store and offline cache.

**Tech Stack:** Supabase (Postgres, Realtime, RLS, pg_cron), plain `fetch` for REST, raw WebSocket for Realtime, Node.js built-in test runner (`node --test`), `node:vm` for in-process test isolation.

## Global Constraints

- Test runner: `node --test tests/*.test.mjs` — all test files must match this glob.
- Test isolation: load source files with `vm.runInNewContext`; never import them with `import`.
- Existing `local_legacy` sessions must continue working without any changes to their behaviour.
- `chrome.storage.local` stores credentials (`ownerToken`, `guestToken`) and offline cache only — never uploaded to Supabase.
- All source files use IIFE + `(window)` pattern matching the existing codebase; no ES module syntax in `src/`.
- Manifest V3, no build step — new shared files must be added to `content_scripts.js` array in `manifest.json` before `store.js`.
- Supabase URL and anon key are hard-coded in `api-client.js`; replace the two placeholder strings before loading the extension.
- `node --test` is run from the repo root; file paths in tests are relative to that root.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/001_schema.sql` | Tables, indexes, cascade |
| Create | `supabase/migrations/002_rls.sql` | RLS policies and helper functions |
| Create | `supabase/migrations/003_rpc.sql` | `join_session` RPC (server-side join verification) |
| Create | `supabase/migrations/004_realtime.sql` | Enable Realtime replication on tables |
| Create | `supabase/migrations/005_pg_cron.sql` | Session TTL cron jobs |
| Create | `src/shared/api-client.js` | Supabase REST wrapper; exposes `window.WebCommentApiClient` |
| Create | `src/shared/realtime-client.js` | Supabase Realtime WebSocket; exposes `window.WebCommentRealtimeClient` |
| Modify | `manifest.json` | Add `api-client.js` and `realtime-client.js` to `content_scripts.js` before `store.js` |
| Modify | `src/shared/store.js` | Add remote branches to session, comment, read, and admin functions |
| Modify | `src/content/content-script.js` | Subscribe/unsubscribe Realtime on overlay activate/deactivate |
| Create | `tests/api-client.test.mjs` | Unit tests for api-client fetch logic |
| Create | `tests/realtime-client.test.mjs` | Unit tests for realtime WebSocket logic |
| Create | `tests/store-remote.test.mjs` | Unit tests for store.js remote branches |

---

## Task 1: Supabase Project Setup + Schema SQL

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `supabase/migrations/002_rls.sql`
- Create: `supabase/migrations/003_rpc.sql`
- Create: `supabase/migrations/004_realtime.sql`
- Create: `supabase/migrations/005_pg_cron.sql`

**Interfaces:**
- Produces: `review_sessions`, `session_guests`, `pages`, `pins`, `threads`, `comments` tables; `join_session(uuid,text,text,text)` RPC returning `json`; `has_session_read_access(uuid)` and `has_session_write_access(uuid)` SQL functions.

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com, sign in, click New Project. Choose a region. Note your Project URL and `anon` key from Settings → API — you will need them in Task 2.

- [ ] **Step 2: Write `supabase/migrations/001_schema.sql`**

```sql
-- 001_schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE review_sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  status             text        NOT NULL DEFAULT 'active',
  password_hash      text        NOT NULL DEFAULT '',
  invite_secret_hash text        NOT NULL DEFAULT '',
  owner_token_hash   text        NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);

CREATE TABLE session_guests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  token_hash   text        NOT NULL,
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  removed_at   timestamptz
);

CREATE TABLE pages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  page_key    text        NOT NULL,
  latest_url  text        NOT NULL,
  hostname    text        NOT NULL,
  pathname    text        NOT NULL,
  title       text,
  environment text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, page_key)
);

CREATE TABLE pins (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid        NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  thread_id       uuid,
  created_by      text        NOT NULL,
  anchor          jsonb       NOT NULL,
  anchor_revision integer     NOT NULL DEFAULT 1,
  moved_by        text,
  moved_at        timestamptz,
  status          text        NOT NULL DEFAULT 'attached',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE threads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id      uuid        NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  session_id  uuid        NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'open',
  resolved_by text,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  session_id        uuid        NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  parent_comment_id uuid        REFERENCES comments(id),
  author_id         text        NOT NULL,
  author_name       text        NOT NULL,
  author_initials   text        NOT NULL,
  body              text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  edited_at         timestamptz
);

CREATE INDEX ON session_guests(session_id, status);
CREATE INDEX ON pages(session_id, page_key);
CREATE INDEX ON pins(page_id, session_id);
CREATE INDEX ON threads(pin_id);
CREATE INDEX ON threads(session_id);
CREATE INDEX ON comments(thread_id, created_at);
CREATE INDEX ON comments(session_id);
```

- [ ] **Step 3: Write `supabase/migrations/002_rls.sql`**

```sql
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
```

- [ ] **Step 4: Write `supabase/migrations/003_rpc.sql`**

```sql
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
```

- [ ] **Step 5: Write `supabase/migrations/004_realtime.sql`**

```sql
-- 004_realtime.sql
-- Enable Supabase Realtime broadcast on the session channel.
-- No table replication needed — we use broadcast mode (client-side after write).
-- To allow broadcast from Extension clients, no additional config is required;
-- Supabase Realtime allows broadcast by default for channels not protected by JWT.
ALTER PUBLICATION supabase_realtime ADD TABLE review_sessions;
```

- [ ] **Step 6: Write `supabase/migrations/005_pg_cron.sql`**

```sql
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
```

- [ ] **Step 7: Apply all migrations in Supabase SQL editor**

Open Supabase dashboard → SQL Editor. Run each file in order:
`001_schema.sql` → `002_rls.sql` → `003_rpc.sql` → `004_realtime.sql` → `005_pg_cron.sql`.

Verify in Table Editor that the six tables exist and have the expected columns.

- [ ] **Step 8: Commit SQL files**

```bash
git add supabase/
git commit -m "feat: add supabase schema, rls, rpc, realtime, and pg_cron migrations"
```

---

## Task 2: `api-client.js` — Supabase REST Wrapper

**Files:**
- Create: `src/shared/api-client.js`
- Create: `tests/api-client.test.mjs`

**Interfaces:**
- Produces: `window.WebCommentApiClient` with methods: `createSession`, `joinSession`, `fetchSessionPageData`, `upsertPage`, `insertPin`, `insertThread`, `linkPinToThread`, `insertComment`, `updateComment`, `deleteComment`, `deleteThread`, `setThreadResolved`, `updatePinAnchor`, `closeSession`, `removeGuest`, `changePassword`, `resetInviteLink`, `listSessions`.
- Also exposes `SUPABASE_URL` and `SUPABASE_ANON_KEY` as properties (consumed by `realtime-client.js` in Task 3).

- [ ] **Step 1: Write the failing test**

```js
// tests/api-client.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadClient(fetchImpl) {
  const window = { fetch: fetchImpl };
  vm.runInNewContext(fs.readFileSync('src/shared/api-client.js', 'utf8'), { window });
  return window.WebCommentApiClient;
}

function mockFetch(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

test('createSession posts to /review_sessions and returns first row', async () => {
  const expected = { id: 'uuid-1', name: 'Test', status: 'active' };
  const client = loadClient(mockFetch(201, [expected]));
  const result = await client.createSession({
    name: 'Test',
    passwordHash: 'ph',
    inviteSecretHash: 'ish',
    ownerTokenHash: 'oth',
  });
  assert.deepEqual(result, expected);
});

test('joinSession calls /rpc/join_session and returns json', async () => {
  const expected = { guestId: 'g1', guestToken: 'guest_abc', displayName: 'Ada' };
  const client = loadClient(mockFetch(200, expected));
  const result = await client.joinSession({
    sessionId: 'sess-1',
    inviteSecret: 'inv',
    password: 'pass',
    displayName: 'Ada',
  });
  assert.deepEqual(result, expected);
});

test('supabaseFetch throws on non-ok response', async () => {
  const client = loadClient(mockFetch(403, { message: 'permission_denied', code: 'permission_denied' }));
  await assert.rejects(
    () => client.listSessions('bad-token'),
    (err) => {
      assert.equal(err.message, 'permission_denied');
      assert.equal(err.code, 'permission_denied');
      assert.equal(err.status, 403);
      return true;
    },
  );
});

test('fetchSessionPageData returns empty result when page not found', async () => {
  const client = loadClient(mockFetch(200, []));
  const result = await client.fetchSessionPageData('sess-1', '/home', 'token');
  assert.deepEqual(result, { page: null, pins: [], threads: [], comments: [] });
});

test('updatePinAnchor throws anchor_revision_conflict when patch returns empty array', async () => {
  const client = loadClient(mockFetch(200, []));
  await assert.rejects(
    () => client.updatePinAnchor('pin-1', {}, 1, 'actor-1', 'token'),
    (err) => {
      assert.equal(err.code, 'anchor_revision_conflict');
      return true;
    },
  );
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
node --test tests/api-client.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` or `Cannot read properties` because `src/shared/api-client.js` does not exist yet.

- [ ] **Step 3: Create `src/shared/api-client.js`**

```js
(function attachWebCommentApiClient(global) {
  const SUPABASE_URL = 'https://REPLACE_WITH_PROJECT_REF.supabase.co';
  const SUPABASE_ANON_KEY = 'REPLACE_WITH_ANON_KEY';

  async function supabaseFetch(path, options, token) {
    const res = await (global.fetch || fetch)(`${SUPABASE_URL}/rest/v1${path}`, {
      ...(options || {}),
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...((options || {}).headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.code = body.code;
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function first(rows) {
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function createSession({ name, passwordHash, inviteSecretHash, ownerTokenHash }) {
    return first(await supabaseFetch('/review_sessions', {
      method: 'POST',
      body: JSON.stringify({
        name,
        status: 'active',
        password_hash: passwordHash,
        invite_secret_hash: inviteSecretHash,
        owner_token_hash: ownerTokenHash,
      }),
    }));
  }

  async function joinSession({ sessionId, inviteSecret, password, displayName }) {
    return supabaseFetch('/rpc/join_session', {
      method: 'POST',
      body: JSON.stringify({
        p_session_id: sessionId,
        p_invite_secret: inviteSecret,
        p_password: password,
        p_display_name: displayName,
      }),
    });
  }

  async function listSessions(token) {
    return supabaseFetch('/review_sessions?order=updated_at.desc&select=*', {}, token) || [];
  }

  async function fetchSessionPageData(sessionId, pageKey, token) {
    const pages = await supabaseFetch(
      `/pages?session_id=eq.${sessionId}&page_key=eq.${encodeURIComponent(pageKey)}&select=*`,
      {},
      token,
    );
    if (!pages || pages.length === 0) return { page: null, pins: [], threads: [], comments: [] };
    const page = pages[0];

    const pins = await supabaseFetch(`/pins?page_id=eq.${page.id}&select=*`, {}, token) || [];
    if (pins.length === 0) return { page, pins: [], threads: [], comments: [] };

    const pinIds = pins.map((p) => p.id).join(',');
    const threads = await supabaseFetch(`/threads?pin_id=in.(${pinIds})&select=*`, {}, token) || [];
    const threadIds = threads.map((t) => t.id).join(',');
    if (!threadIds) return { page, pins, threads, comments: [] };

    const comments = await supabaseFetch(
      `/comments?thread_id=in.(${threadIds})&order=created_at.asc&select=*`,
      {},
      token,
    ) || [];

    return { page, pins, threads, comments };
  }

  async function upsertPage({ sessionId, pageKey, latestUrl, hostname, pathname, title, environment }, token) {
    return first(await supabaseFetch('/pages?on_conflict=session_id,page_key', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({
        session_id: sessionId,
        page_key: pageKey,
        latest_url: latestUrl,
        hostname,
        pathname,
        title: title || pageKey,
        environment: environment || 'production',
        updated_at: new Date().toISOString(),
      }),
    }, token));
  }

  async function insertPin({ pageId, sessionId, createdBy, anchor }, token) {
    return first(await supabaseFetch('/pins', {
      method: 'POST',
      body: JSON.stringify({
        page_id: pageId,
        session_id: sessionId,
        created_by: createdBy,
        anchor,
        anchor_revision: 1,
        status: anchor.mode === 'page' ? 'approximate' : 'attached',
      }),
    }, token));
  }

  async function insertThread({ pinId, sessionId }, token) {
    return first(await supabaseFetch('/threads', {
      method: 'POST',
      body: JSON.stringify({ pin_id: pinId, session_id: sessionId, status: 'open' }),
    }, token));
  }

  async function linkPinToThread(pinId, threadId, token) {
    await supabaseFetch(`/pins?id=eq.${pinId}`, {
      method: 'PATCH',
      body: JSON.stringify({ thread_id: threadId }),
    }, token);
  }

  async function insertComment({ threadId, sessionId, parentCommentId, authorId, authorName, authorInitials, body }, token) {
    return first(await supabaseFetch('/comments', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: threadId,
        session_id: sessionId,
        parent_comment_id: parentCommentId || null,
        author_id: authorId,
        author_name: authorName,
        author_initials: authorInitials,
        body,
      }),
    }, token));
  }

  async function updateComment(commentId, body, token) {
    const now = new Date().toISOString();
    return first(await supabaseFetch(`/comments?id=eq.${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body, updated_at: now, edited_at: now }),
    }, token));
  }

  async function deleteComment(commentId, token) {
    await supabaseFetch(`/comments?id=eq.${commentId}`, {
      method: 'DELETE',
      headers: { Prefer: '' },
    }, token);
  }

  async function deleteThread(threadId, token) {
    await supabaseFetch(`/threads?id=eq.${threadId}`, {
      method: 'DELETE',
      headers: { Prefer: '' },
    }, token);
  }

  async function setThreadResolved(threadId, resolved, resolvedBy, token) {
    const now = new Date().toISOString();
    return first(await supabaseFetch(`/threads?id=eq.${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: resolved ? 'resolved' : 'open',
        resolved_by: resolved ? resolvedBy : null,
        resolved_at: resolved ? now : null,
        updated_at: now,
      }),
    }, token));
  }

  async function updatePinAnchor(pinId, anchor, anchorRevision, movedBy, token) {
    const now = new Date().toISOString();
    const rows = await supabaseFetch(`/pins?id=eq.${pinId}&anchor_revision=eq.${anchorRevision}`, {
      method: 'PATCH',
      body: JSON.stringify({
        anchor: { ...anchor, manualPosition: true },
        anchor_revision: anchorRevision + 1,
        moved_by: movedBy,
        moved_at: now,
        updated_at: now,
        status: anchor.mode === 'page' ? 'approximate' : 'attached',
      }),
    }, token);
    if (!rows || rows.length === 0) {
      const err = new Error('Anchor revision conflict');
      err.code = 'anchor_revision_conflict';
      throw err;
    }
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function closeSession(sessionId, token) {
    const now = new Date().toISOString();
    await supabaseFetch(`/review_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed', closed_at: now, updated_at: now }),
    }, token);
  }

  async function removeGuest(guestId, token) {
    const now = new Date().toISOString();
    await supabaseFetch(`/session_guests?id=eq.${guestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'removed', removed_at: now }),
    }, token);
  }

  async function changePassword(sessionId, passwordHash, token) {
    await supabaseFetch(`/review_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: passwordHash, updated_at: new Date().toISOString() }),
    }, token);
  }

  async function resetInviteLink(sessionId, inviteSecretHash, token) {
    await supabaseFetch(`/review_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ invite_secret_hash: inviteSecretHash, updated_at: new Date().toISOString() }),
    }, token);
  }

  global.WebCommentApiClient = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    createSession,
    joinSession,
    listSessions,
    fetchSessionPageData,
    upsertPage,
    insertPin,
    insertThread,
    linkPinToThread,
    insertComment,
    updateComment,
    deleteComment,
    deleteThread,
    setThreadResolved,
    updatePinAnchor,
    closeSession,
    removeGuest,
    changePassword,
    resetInviteLink,
  };
})(window);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
node --test tests/api-client.test.mjs
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/api-client.js tests/api-client.test.mjs
git commit -m "feat: add api-client.js with supabase rest wrapper"
```

---

## Task 3: `realtime-client.js` — Supabase Realtime WebSocket

**Files:**
- Create: `src/shared/realtime-client.js`
- Create: `tests/realtime-client.test.mjs`

**Interfaces:**
- Consumes: `window.WebCommentApiClient.SUPABASE_URL` and `SUPABASE_ANON_KEY` (must load after `api-client.js`).
- Produces: `window.WebCommentRealtimeClient` with methods: `subscribe(sessionId)` → `{ on(event, fn), unsubscribe() }`, `broadcast(sessionId, event, payload)`, `disconnect()`.

- [ ] **Step 1: Write the failing test**

```js
// tests/realtime-client.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function makeWebSocketClass(calls) {
  return class MockWebSocket {
    static get OPEN() { return 1; }
    constructor(url) {
      this.url = url;
      this.readyState = 1; // OPEN
      this.sent = [];
      calls.push(this);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    triggerOpen() { this.onopen?.(); }
    triggerMessage(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    triggerClose() { this.onclose?.(); }
  };
}

function loadClient(MockWebSocket) {
  const wsSockets = [];
  const WS = MockWebSocket || makeWebSocketClass(wsSockets);
  const window = {
    WebSocket: WS,
    WebCommentApiClient: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    },
  };
  vm.runInNewContext(fs.readFileSync('src/shared/realtime-client.js', 'utf8'), { window });
  return { client: window.WebCommentRealtimeClient, sockets: wsSockets, WS };
}

test('subscribe connects websocket and sends phx_join on open', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  client.subscribe('session-1');
  assert.equal(sockets.length, 1);
  sockets[0].triggerOpen();
  const join = sockets[0].sent.find((f) => f.event === 'phx_join');
  assert.ok(join, 'phx_join not sent');
  assert.equal(join.topic, 'realtime:session:session-1');
});

test('on handler receives broadcast events from other clients', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  const received = [];
  client.subscribe('session-2').on('COMMENT_CREATED', (p) => received.push(p));
  sockets[0].triggerOpen();
  sockets[0].triggerMessage({
    topic: 'realtime:session:session-2',
    event: 'broadcast',
    payload: { event: 'COMMENT_CREATED', payload: { body: 'hello' } },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].body, 'hello');
});

test('broadcast sends a broadcast frame to the channel', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  client.subscribe('session-3');
  sockets[0].triggerOpen();
  client.broadcast('session-3', 'PIN_CREATED', { pinId: 'p1' });
  const frame = sockets[0].sent.find((f) => f.event === 'broadcast');
  assert.ok(frame, 'broadcast frame not sent');
  assert.equal(frame.payload.event, 'PIN_CREATED');
  assert.equal(frame.payload.payload.pinId, 'p1');
});

test('unsubscribe sends phx_leave and removes handlers', () => {
  const sockets = [];
  const { client } = loadClient(makeWebSocketClass(sockets));
  const received = [];
  const sub = client.subscribe('session-4').on('COMMENT_CREATED', (p) => received.push(p));
  sockets[0].triggerOpen();
  sub.unsubscribe();
  const leave = sockets[0].sent.find((f) => f.event === 'phx_leave');
  assert.ok(leave, 'phx_leave not sent');
  sockets[0].triggerMessage({
    topic: 'realtime:session:session-4',
    event: 'broadcast',
    payload: { event: 'COMMENT_CREATED', payload: { body: 'after unsub' } },
  });
  assert.equal(received.length, 0);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
node --test tests/realtime-client.test.mjs
```

Expected: Error because `src/shared/realtime-client.js` does not exist.

- [ ] **Step 3: Create `src/shared/realtime-client.js`**

```js
(function attachWebCommentRealtimeClient(global) {
  const apiClient = global.WebCommentApiClient || {};
  const SUPABASE_URL = apiClient.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = apiClient.SUPABASE_ANON_KEY || '';
  const WS_URL = `${SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

  const WS = global.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);

  let ws = null;
  let ref = 0;
  let currentJoinRef = '1';
  let heartbeatTimer = null;
  const channels = new Map();
  const joined = new Set();

  function nextRef() { return String(++ref); }

  function send(frame) {
    if (ws && ws.readyState === WS.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }

  function doJoin(topic) {
    const r = nextRef();
    currentJoinRef = r;
    send({ topic, event: 'phx_join', payload: { config: { broadcast: { ack: false, self: false } } }, ref: r, join_ref: r });
    joined.add(topic);
  }

  function connect() {
    if (!WS) return;
    ws = new WS(WS_URL);
    ws.onopen = () => {
      heartbeatTimer = setInterval(() => {
        send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
      }, 30000);
      channels.forEach((_, topic) => doJoin(topic));
    };
    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      joined.clear();
      setTimeout(connect, 5000);
    };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.event !== 'broadcast') return;
      const eventName = msg.payload && msg.payload.event;
      const payload = msg.payload && msg.payload.payload;
      const handlers = channels.get(msg.topic);
      if (handlers && eventName) {
        const fns = handlers.get(eventName);
        if (fns) fns.forEach((fn) => fn(payload));
      }
    };
  }

  const realtimeClient = {
    subscribe(sessionId) {
      const topic = `realtime:session:${sessionId}`;
      if (!channels.has(topic)) channels.set(topic, new Map());
      if (!ws) {
        connect();
      } else if (ws.readyState === WS.OPEN && !joined.has(topic)) {
        doJoin(topic);
      }
      return {
        on(event, fn) {
          const handlers = channels.get(topic);
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(fn);
          return this;
        },
        unsubscribe() { realtimeClient.unsubscribe(sessionId); },
      };
    },

    broadcast(sessionId, event, payload) {
      send({
        topic: `realtime:session:${sessionId}`,
        event: 'broadcast',
        payload: { type: 'broadcast', event, payload },
        ref: nextRef(),
        join_ref: currentJoinRef,
      });
    },

    unsubscribe(sessionId) {
      const topic = `realtime:session:${sessionId}`;
      if (joined.has(topic)) {
        send({ topic, event: 'phx_leave', payload: {}, ref: nextRef(), join_ref: currentJoinRef });
      }
      channels.delete(topic);
      joined.delete(topic);
    },

    disconnect() {
      clearInterval(heartbeatTimer);
      if (ws) { ws.close(); ws = null; }
      channels.clear();
      joined.clear();
    },
  };

  global.WebCommentRealtimeClient = realtimeClient;
})(window);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
node --test tests/realtime-client.test.mjs
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/realtime-client.js tests/realtime-client.test.mjs
git commit -m "feat: add realtime-client.js with supabase websocket broadcast"
```

---

## Task 4: Update `manifest.json` — Load New Shared Files

**Files:**
- Modify: `manifest.json`

**Interfaces:**
- Produces: `api-client.js` and `realtime-client.js` available as globals in all content script contexts, loaded before `store.js`.

- [ ] **Step 1: Edit `manifest.json` content_scripts.js array**

Change from:
```json
"js": ["src/shared/session-access.js", "src/shared/store.js", "src/content/content-script.js"]
```

To:
```json
"js": [
  "src/shared/session-access.js",
  "src/shared/api-client.js",
  "src/shared/realtime-client.js",
  "src/shared/store.js",
  "src/content/content-script.js"
]
```

- [ ] **Step 2: Verify extension loads in Chrome**

Load the unpacked extension in `chrome://extensions`. Open any webpage and check the DevTools console for errors. `window.WebCommentApiClient` and `window.WebCommentRealtimeClient` must be defined.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: load api-client and realtime-client in content scripts"
```

---

## Task 5: `store.js` — Session Create and Join (Remote Branch)

**Files:**
- Modify: `src/shared/store.js` (functions: `createPrivateSession`, `joinPrivateSession`, `buildInviteLink`, `buildAdminLink`)
- Create: `tests/store-remote.test.mjs`

**Interfaces:**
- Consumes: `window.WebCommentApiClient.createSession`, `joinSession`.
- Produces: `createPrivateSession` and `joinPrivateSession` write to Supabase for non-`local_legacy` sessions; local state is updated with Supabase-assigned UUIDs.

- [ ] **Step 1: Write the failing tests**

```js
// tests/store-remote.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const accessSrc = fs.readFileSync('src/shared/session-access.js', 'utf8');
const storeSrc  = fs.readFileSync('src/shared/store.js', 'utf8');
const clientSrc = fs.readFileSync('src/shared/api-client.js', 'utf8');

function buildChromeStorage(initial = {}) {
  const store = { ...initial };
  return {
    local: {
      get(keys, cb) {
        const result = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) result[k] = store[k]; });
        cb(result);
      },
      set(payload, cb) { Object.assign(store, payload); cb?.(); },
    },
    raw: store,
  };
}

function loadStore(apiOverrides = {}, initial = {}) {
  const storage = buildChromeStorage(initial);
  const apiCalls = [];

  const mockApi = {
    createSession: async (data) => { apiCalls.push({ fn: 'createSession', data }); return { id: 'remote-sess-uuid', ...data, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; },
    joinSession: async (data) => { apiCalls.push({ fn: 'joinSession', data }); return { guestId: 'remote-guest-uuid', guestToken: 'guest_abc123', displayName: data.displayName }; },
    ...apiOverrides,
  };

  const window = {
    crypto: webcrypto,
    btoa(v) { return Buffer.from(v, 'binary').toString('base64'); },
    TextEncoder,
    Uint8Array,
    WebCommentApiClient: mockApi,
    WebCommentRealtimeClient: { subscribe() { return { on() { return this; } }; } },
    chrome: { storage, runtime: { lastError: null } },
  };

  vm.runInNewContext(accessSrc, { window, crypto: webcrypto, TextEncoder, Uint8Array, btoa: window.btoa });
  vm.runInNewContext(storeSrc, { window, CSS: { escape: (v) => v }, Node: { ELEMENT_NODE: 1 }, document: { evaluate: () => ({ singleNodeValue: null }), querySelector: () => null, querySelectorAll: () => [] }, console });

  return { store: window.WebCommentStore, apiCalls, storage };
}

test('createPrivateSession writes to Supabase and stores ownerToken locally', async () => {
  const { store, apiCalls, storage } = loadStore();
  const result = await store.createPrivateSession({ name: 'Remote Test', password: 'pw1', pageContext: null });
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].fn, 'createSession');
  assert.equal(result.session.id, 'remote-sess-uuid');
  const state = storage.raw['webcomment.mvp.state.v1'];
  assert.ok(state.sessions['remote-sess-uuid'], 'session should be in local cache');
  assert.ok(state.access['remote-sess-uuid']?.token, 'ownerToken should be stored locally');
});

test('joinPrivateSession calls joinSession RPC and stores guestToken locally', async () => {
  const { store, apiCalls, storage } = loadStore();
  const result = await store.joinPrivateSession({ sessionId: 'remote-sess-uuid', inviteSecret: 'inv', password: 'pw1', displayName: 'Ada' });
  assert.equal(apiCalls[0].fn, 'joinSession');
  assert.equal(result.guestToken, 'guest_abc123');
  const state = storage.raw['webcomment.mvp.state.v1'];
  assert.ok(state.access['remote-sess-uuid']?.token, 'guestToken should be stored locally');
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
node --test tests/store-remote.test.mjs
```

Expected: both tests fail because `store.js` does not yet call `WebCommentApiClient`.

- [ ] **Step 3: Add remote branch to `createPrivateSession` in `store.js`**

Find the existing `createPrivateSession` function and add a remote branch at the start (after token generation):

```js
async function createPrivateSession({ name, password, pageContext }) {
  const helpers = requireAccessHelpers();
  const state = await readState();
  const projectId = Object.keys(state.projects)[0];
  const createdAt = now();
  const invite = await helpers.createCapability('invite');
  const owner = await helpers.createCapability('owner');
  const ownerId = id('owner');
  const sessionName = name || `私人 Review ${new Date().toLocaleDateString()}`;
  const passwordHash = await helpers.hashSecret(password);

  const api = global.WebCommentApiClient;
  if (api) {
    const remoteSession = await api.createSession({
      name: sessionName,
      passwordHash,
      inviteSecretHash: invite.hash,
      ownerTokenHash: owner.hash,
    });
    const sessionId = remoteSession.id;
    state.sessions[sessionId] = {
      id: sessionId,
      projectId,
      name: sessionName,
      status: 'active',
      accessMode: 'guest_password',
      passwordHash,
      inviteSecretHash: invite.hash,
      ownerTokenHash: owner.hash,
      closedAt: null,
      createdBy: 'owner',
      createdAt,
      updatedAt: createdAt,
    };
    state.access[sessionId] = {
      sessionId,
      role: 'owner',
      token: owner.token,
      ownerId,
      storedOwnerTokenForAdminRecovery: owner.token,
      guestId: null,
      storedAt: createdAt,
    };
    if (pageContext) ensurePage(state, sessionId, pageContext);
    await writeState(state);
    await setActiveSessionId(sessionId);
    return {
      session: state.sessions[sessionId],
      inviteSecret: invite.token,
      ownerToken: owner.token,
      inviteLink: buildInviteLink(sessionId, invite.token, pageContext),
      adminLink: buildAdminLink(sessionId, owner.token, pageContext),
    };
  }

  // Existing local_legacy path below — unchanged
  const sessionId = id('session');
  // ... (keep all existing code from `state.sessions[sessionId] = {` onward)
```

- [ ] **Step 4: Add remote branch to `joinPrivateSession` in `store.js`**

Find the existing `joinPrivateSession` function and add a remote branch. The remote path calls the `join_session` RPC (which handles password verification server-side) then stores the guest token locally:

```js
async function joinPrivateSession({ sessionId, inviteSecret, password, displayName }) {
  const helpers = requireAccessHelpers();
  const state = await readState();

  const api = global.WebCommentApiClient;
  if (api) {
    const result = await api.joinSession({ sessionId, inviteSecret, password, displayName });
    const createdAt = now();
    state.sessionGuests[result.guestId] = {
      id: result.guestId,
      sessionId,
      displayName: result.displayName,
      tokenHash: '',
      status: 'active',
      createdAt,
      lastSeenAt: createdAt,
    };
    state.access[sessionId] = {
      sessionId,
      role: 'guest',
      token: result.guestToken,
      ownerId: state.access[sessionId]?.ownerId || null,
      storedOwnerTokenForAdminRecovery: state.access[sessionId]?.storedOwnerTokenForAdminRecovery || null,
      guestId: result.guestId,
      storedAt: createdAt,
    };
    if (!state.sessions[sessionId]) {
      state.sessions[sessionId] = {
        id: sessionId,
        projectId: Object.keys(state.projects)[0],
        name: '',
        status: 'active',
        accessMode: 'guest_password',
        passwordHash: '',
        inviteSecretHash: '',
        ownerTokenHash: '',
        closedAt: null,
        createdBy: 'owner',
        createdAt,
        updatedAt: createdAt,
      };
    }
    await writeState(state);
    await setActiveSessionId(sessionId);
    return {
      session: state.sessions[sessionId],
      guest: state.sessionGuests[result.guestId],
      guestToken: result.guestToken,
    };
  }

  // Existing local path — unchanged
  const session = state.sessions[sessionId];
  if (!session) throw new Error('Session not found');
  // ... keep existing code
```

- [ ] **Step 5: Update `buildInviteLink` and `buildAdminLink` to use real domain**

In `store.js`, replace the placeholder URLs:

```js
function buildInviteLink(sessionId, inviteSecret, pageContext) {
  const target = pageContext?.url || '';
  const pageKey = pageContext?.pageKey || '';
  return `https://app.webcomment.app/review/${encodeURIComponent(sessionId)}?invite=${encodeURIComponent(inviteSecret)}&pageKey=${encodeURIComponent(pageKey)}&target=${encodeURIComponent(target)}`;
}

function buildAdminLink(sessionId, ownerToken, pageContext) {
  const target = pageContext?.url || '';
  return `https://app.webcomment.app/admin/${encodeURIComponent(sessionId)}?owner=${encodeURIComponent(ownerToken)}&target=${encodeURIComponent(target)}`;
}
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
node --test tests/store-remote.test.mjs
```

Expected: both tests pass.

- [ ] **Step 7: Run the full test suite to verify no regressions**

```bash
node --test tests/*.test.mjs
```

Expected: all existing tests continue to pass.

- [ ] **Step 8: Commit**

```bash
git add src/shared/store.js tests/store-remote.test.mjs
git commit -m "feat: createPrivateSession and joinPrivateSession use supabase when api-client is available"
```

---

## Task 6: `store.js` — Comment Operations (Remote Branch)

**Files:**
- Modify: `src/shared/store.js` (functions: `createThread`, `addReply`, `updateComment`, `deleteComment`)
- Modify: `tests/store-remote.test.mjs` (add tests)

**Interfaces:**
- Consumes: `window.WebCommentApiClient.upsertPage`, `insertPin`, `insertThread`, `linkPinToThread`, `insertComment`, `updateComment`, `deleteComment`, `deleteThread`.
- Consumes: `window.WebCommentRealtimeClient.broadcast`.
- Produces: remote writes followed by broadcast; local optimistic state on pending and replaced with server IDs on success.

- [ ] **Step 1: Add tests to `tests/store-remote.test.mjs`**

```js
test('createThread writes pin/thread/comment to Supabase and broadcasts PIN_CREATED', async () => {
  const broadcasts = [];
  const { store, apiCalls } = loadStore({
    upsertPage: async () => ({ id: 'page-uuid' }),
    insertPin: async () => ({ id: 'pin-uuid', status: 'attached', anchor_revision: 1 }),
    insertThread: async () => ({ id: 'thread-uuid', status: 'open' }),
    linkPinToThread: async () => {},
    insertComment: async () => ({ id: 'comment-uuid', body: 'Hello' }),
  });
  // Inject broadcast spy
  // We need to rebuild with broadcast mock — see note below
  const pageCtx = { url: 'https://ex.com/', pageKey: '/', hostname: 'ex.com', pathname: '/', title: '', environment: 'production' };
  // createThread requires a valid session in state; set up via createPrivateSession first
  await store.createPrivateSession({ name: 'T', password: 'p', pageContext: null });
  // The active session will be 'remote-sess-uuid' from our mock
  const result = await store.createThread('remote-sess-uuid', pageCtx, { mode: 'element', selector: 'h1' }, 'Hello');
  assert.ok(result.pin.id, 'pin should have an id');
  assert.ok(result.thread.id, 'thread should have an id');
  assert.ok(result.comment.id, 'comment should have an id');
});

test('addReply writes to Supabase and broadcasts COMMENT_CREATED', async () => {
  const insertCommentCalls = [];
  const { store } = loadStore({
    upsertPage: async () => ({ id: 'page-uuid' }),
    insertPin: async () => ({ id: 'pin-uuid', status: 'attached', anchor_revision: 1 }),
    insertThread: async () => ({ id: 'thread-uuid', status: 'open' }),
    linkPinToThread: async () => {},
    insertComment: async (data) => {
      insertCommentCalls.push(data);
      return { id: `comment-${insertCommentCalls.length}`, body: data.body, thread_id: data.threadId };
    },
  });
  const pageCtx = { url: 'https://ex.com/', pageKey: '/', hostname: 'ex.com', pathname: '/', title: '', environment: 'production' };
  await store.createPrivateSession({ name: 'T', password: 'p', pageContext: null });
  // createThread caches thread in local state — addReply can now look up sessionId
  await store.createThread('remote-sess-uuid', pageCtx, { mode: 'element', selector: 'h1' }, 'Root');
  const callsBefore = insertCommentCalls.length;
  const reply = await store.addReply('thread-uuid', 'Reply text');
  assert.equal(insertCommentCalls.length, callsBefore + 1);
  assert.equal(insertCommentCalls[callsBefore].body, 'Reply text');
  assert.ok(reply.id, 'reply should have an id from server');
});
```

- [ ] **Step 2: Add remote branch to `createThread` in `store.js`**

```js
async function createThread(sessionId, pageContext, anchor, body) {
  const state = await readState();
  const accessRole = await requireSessionCommentAccess(state, sessionId);
  const author = getCurrentAuthor(state, sessionId, accessRole);

  const api = global.WebCommentApiClient;
  const rt = global.WebCommentRealtimeClient;

  if (api && state.sessions[sessionId]?.accessMode !== 'local_legacy') {
    const page = await api.upsertPage({
      sessionId,
      pageKey: pageContext.pageKey,
      latestUrl: pageContext.url,
      hostname: pageContext.hostname,
      pathname: pageContext.pathname,
      title: pageContext.title,
      environment: pageContext.environment,
    }, state.access[sessionId]?.token);

    const pin = await api.insertPin({
      pageId: page.id,
      sessionId,
      createdBy: author.id,
      anchor,
    }, state.access[sessionId]?.token);

    const thread = await api.insertThread({ pinId: pin.id, sessionId }, state.access[sessionId]?.token);
    await api.linkPinToThread(pin.id, thread.id, state.access[sessionId]?.token);

    const comment = await api.insertComment({
      threadId: thread.id,
      sessionId,
      parentCommentId: null,
      authorId: author.id,
      authorName: author.displayName,
      authorInitials: author.initials,
      body,
    }, state.access[sessionId]?.token);

    // Cache server rows in local state so addReply / deleteComment can look up sessionId
    const createdAt = now();
    state.pages[page.id] = { id: page.id, sessionId, pageKey: pageContext.pageKey, latestUrl: pageContext.url, hostname: pageContext.hostname, pathname: pageContext.pathname, title: pageContext.title || pageContext.pageKey, environment: pageContext.environment, identity: `${sessionId}::${pageContext.pageKey}`, createdAt, updatedAt: createdAt };
    state.pins[pin.id] = { id: pin.id, pageId: page.id, sessionId, threadId: thread.id, createdBy: author.id, anchor, anchorRevision: 1, movedBy: null, movedAt: null, status: pin.status, createdAt, updatedAt: createdAt };
    state.threads[thread.id] = { id: thread.id, pinId: pin.id, sessionId, status: 'open', resolvedBy: null, resolvedAt: null, createdAt, updatedAt: createdAt };
    state.comments[comment.id] = { id: comment.id, threadId: thread.id, parentCommentId: null, authorId: author.id, authorName: author.displayName, authorInitials: author.initials, body, createdAt, updatedAt: createdAt };
    state.sessions[sessionId].updatedAt = createdAt;
    await writeState(state);

    rt?.broadcast(sessionId, 'PIN_CREATED', { pin, thread, comment });
    return { pin, thread, comment };
  }

  // Existing local path — unchanged
  const page = ensurePage(state, sessionId, pageContext);
  // ... keep all existing local code
```

- [ ] **Step 3: Add remote branch to `addReply` in `store.js`**

```js
async function addReply(threadId, body) {
  const state = await readState();
  const thread = state.threads[threadId];
  const api = global.WebCommentApiClient;
  const rt = global.WebCommentRealtimeClient;

  if (api) {
    const sessionId = thread?.sessionId;
    const accessRole = await requireSessionCommentAccess(state, sessionId);
    const author = getCurrentAuthor(state, sessionId, accessRole);
    const token = state.access[sessionId]?.token;
    const parentCommentId = thread ? getOriginalCommentId(state, threadId) : null;

    const comment = await api.insertComment({
      threadId,
      sessionId,
      parentCommentId,
      authorId: author.id,
      authorName: author.displayName,
      authorInitials: author.initials,
      body,
    }, token);

    state.sessions[sessionId].updatedAt = now();
    await writeState(state);
    rt?.broadcast(sessionId, 'COMMENT_CREATED', { threadId, comment });
    return comment;
  }

  // Existing local path — unchanged
  if (!thread) throw new Error('Thread not found');
  // ... keep existing local code
```

- [ ] **Step 4: Add remote branch to `updateComment` in `store.js`**

```js
async function updateComment(commentId, body) {
  const state = await readState();
  const comment = state.comments[commentId];
  const api = global.WebCommentApiClient;

  if (api && comment) {
    const thread = state.threads[comment.threadId];
    const sessionId = thread?.sessionId;
    const accessRole = await requireSessionCommentAccess(state, sessionId);
    if (comment.authorId !== accessRole.actorId) throw new Error(`Cannot edit another user's comment`);
    const token = state.access[sessionId]?.token;
    return api.updateComment(commentId, body, token);
  }

  // Existing local path — unchanged
  if (!comment) throw new Error('Comment not found');
  // ... keep existing local code
```

- [ ] **Step 5: Add remote branch to `deleteComment` in `store.js`**

```js
async function deleteComment(commentId) {
  const state = await readState();
  const comment = state.comments[commentId];
  const api = global.WebCommentApiClient;

  if (api && comment) {
    const thread = state.threads[comment.threadId];
    const sessionId = thread?.sessionId;
    const accessRole = await requireSessionCommentAccess(state, sessionId);
    if (comment.authorId !== accessRole.actorId) throw new Error(`Cannot delete another user's comment`);
    const token = state.access[sessionId]?.token;

    if (!comment.parentCommentId) {
      await api.deleteThread(thread.id, token);
      return { deletedThreadId: thread.id };
    }
    await api.deleteComment(commentId, token);
    return { deletedCommentId: commentId };
  }

  // Existing local path — unchanged
  if (!comment) throw new Error('Comment not found');
  // ... keep existing local code
```

- [ ] **Step 6: Run all tests**

```bash
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/store.js tests/store-remote.test.mjs
git commit -m "feat: createThread, addReply, updateComment, deleteComment use supabase when api-client is available"
```

---

## Task 7: `store.js` — Read Operations + Offline Cache

**Files:**
- Modify: `src/shared/store.js` (functions: `getSessionPageData`, `listSessions`)
- Modify: `tests/store-remote.test.mjs` (add tests)

**Interfaces:**
- Consumes: `window.WebCommentApiClient.fetchSessionPageData`, `listSessions`.
- Produces: `getSessionPageData` fetches from Supabase, writes to local cache; falls back to cache on network failure.

- [ ] **Step 1: Add tests**

```js
test('getSessionPageData fetches from supabase for non-local-legacy sessions', async () => {
  const remoteData = {
    page: { id: 'page-uuid', page_key: '/home' },
    pins: [{ id: 'pin-uuid', anchor: { mode: 'element' } }],
    threads: [{ id: 'thread-uuid', status: 'open' }],
    comments: [{ id: 'comment-uuid', body: 'Hi', thread_id: 'thread-uuid' }],
  };
  const { store } = loadStore({
    fetchSessionPageData: async () => remoteData,
  });
  await store.createPrivateSession({ name: 'T', password: 'p', pageContext: null });
  const pageCtx = { url: 'https://ex.com/', pageKey: '/home', hostname: 'ex.com', pathname: '/home', title: '', environment: 'production' };
  const result = await store.getSessionPageData('remote-sess-uuid', pageCtx, false);
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].body, 'Hi');
});

test('getSessionPageData falls back to local cache when supabase throws', async () => {
  const { store, storage } = loadStore({
    fetchSessionPageData: async () => { throw new Error('network error'); },
  });
  await store.createPrivateSession({ name: 'T', password: 'p', pageContext: null });
  const pageCtx = { url: 'https://ex.com/', pageKey: '/home', hostname: 'ex.com', pathname: '/home', title: '', environment: 'production' };
  const result = await store.getSessionPageData('remote-sess-uuid', pageCtx, false);
  // Local cache has no data for this page key — returns empty
  assert.equal(result.comments.length, 0);
});
```

- [ ] **Step 2: Add remote branch to `getSessionPageData` in `store.js`**

```js
async function getSessionPageData(sessionId, pageContext, includeResolved) {
  const state = await readState();
  const accessRole = await requireSessionReadAccess(state, sessionId);
  const api = global.WebCommentApiClient;

  if (api && state.sessions[sessionId]?.accessMode !== 'local_legacy') {
    const token = state.access[sessionId]?.token;
    try {
      const remote = await api.fetchSessionPageData(sessionId, pageContext.pageKey, token);
      return { ...remote, accessRole };
    } catch {
      // Network error — fall through to local cache
    }
  }

  return {
    ...selectSessionPageData(state, sessionId, pageContext, includeResolved),
    accessRole,
  };
}
```

- [ ] **Step 3: Add remote branch to `listSessions` in `store.js`**

```js
async function listSessions() {
  const state = await readState();
  const api = global.WebCommentApiClient;

  if (api) {
    const tokens = Object.values(state.access || {});
    if (tokens.length === 0) return Object.values(state.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    // Fetch each session we have a token for
    const results = await Promise.all(
      tokens.map(async (acc) => {
        try {
          const rows = await api.listSessions(acc.token);
          return Array.isArray(rows) ? rows : [];
        } catch { return []; }
      }),
    );
    const seen = new Set();
    return results.flat().filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  return Object.values(state.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

- [ ] **Step 4: Run all tests**

```bash
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/store.js tests/store-remote.test.mjs
git commit -m "feat: getSessionPageData and listSessions fetch from supabase with local cache fallback"
```

---

## Task 8: `store.js` — Admin Operations (Remote Branch)

**Files:**
- Modify: `src/shared/store.js` (functions: `closeSession`, `removeGuest`, `changeSessionPassword`, `resetInviteLink`, `setThreadResolved`, `updatePinAnchor`)
- Modify: `tests/store-remote.test.mjs` (add tests)

**Interfaces:**
- Consumes: `window.WebCommentApiClient.closeSession`, `removeGuest`, `changePassword`, `resetInviteLink`, `setThreadResolved`, `updatePinAnchor`.
- Consumes: `window.WebCommentRealtimeClient.broadcast` for `setThreadResolved` and `updatePinAnchor`.

- [ ] **Step 1: Add tests**

```js
test('setThreadResolved calls supabase setThreadResolved and returns resolved thread', async () => {
  const resolvedCalls = [];
  const { store } = loadStore({
    upsertPage: async () => ({ id: 'page-uuid' }),
    insertPin: async () => ({ id: 'pin-uuid', status: 'attached', anchor_revision: 1 }),
    insertThread: async () => ({ id: 'thread-uuid', status: 'open' }),
    linkPinToThread: async () => {},
    insertComment: async (data) => ({ id: 'comment-uuid', body: data.body }),
    setThreadResolved: async (threadId, resolved, resolvedBy, token) => {
      resolvedCalls.push({ threadId, resolved });
      return { id: threadId, status: resolved ? 'resolved' : 'open', resolved_at: new Date().toISOString() };
    },
  });
  const pageCtx = { url: 'https://ex.com/', pageKey: '/', hostname: 'ex.com', pathname: '/', title: '', environment: 'production' };
  await store.createPrivateSession({ name: 'T', password: 'p', pageContext: null });
  await store.createThread('remote-sess-uuid', pageCtx, { mode: 'element', selector: 'h1' }, 'Root');
  const result = await store.setThreadResolved('thread-uuid', true);
  assert.equal(resolvedCalls.length, 1);
  assert.equal(resolvedCalls[0].resolved, true);
  assert.equal(result.status, 'resolved');
});
```

- [ ] **Step 2: Add remote branch to `setThreadResolved` in `store.js`**

```js
async function setThreadResolved(threadId, resolved) {
  const state = await readState();
  const thread = state.threads[threadId];
  const api = global.WebCommentApiClient;
  const rt = global.WebCommentRealtimeClient;

  if (api && thread && state.sessions[thread.sessionId]?.accessMode !== 'local_legacy') {
    const accessRole = await requireSessionCommentAccess(state, thread.sessionId);
    const author = getCurrentAuthor(state, thread.sessionId, accessRole);
    const token = state.access[thread.sessionId]?.token;
    const result = await api.setThreadResolved(threadId, resolved, author.id, token);
    const event = resolved ? 'THREAD_RESOLVED' : 'THREAD_REOPENED';
    rt?.broadcast(thread.sessionId, event, { threadId, resolvedBy: author.id, resolvedAt: result.resolved_at });
    return result;
  }

  // Existing local path — unchanged
  if (!thread) throw new Error('Thread not found');
  // ... keep existing local code
```

- [ ] **Step 3: Add remote branch to `updatePinAnchor` in `store.js`**

```js
async function updatePinAnchor(pinId, anchor, expectedRevision) {
  const state = await readState();
  const pin = state.pins[pinId];
  const api = global.WebCommentApiClient;

  if (api && pin && state.sessions[pin.sessionId]?.accessMode !== 'local_legacy') {
    const accessRole = await requireSessionCommentAccess(state, pin.sessionId);
    const author = getCurrentAuthor(state, pin.sessionId, accessRole);
    const token = state.access[pin.sessionId]?.token;
    return api.updatePinAnchor(pinId, anchor, expectedRevision ?? pin.anchorRevision ?? 1, author.id, token);
  }

  // Existing local path — unchanged
  if (!pin) throw new Error('Pin not found');
  // ... keep existing local code
```

- [ ] **Step 4: Add remote branch to `closeSession`, `removeGuest`, `changeSessionPassword`, `resetInviteLink`**

```js
async function closeSession(sessionId) {
  const state = await readState();
  await requireSessionOwnerAccess(state, sessionId);
  const api = global.WebCommentApiClient;
  if (api && state.sessions[sessionId]?.accessMode !== 'local_legacy') {
    const token = state.access[sessionId]?.token;
    await api.closeSession(sessionId, token);
    if (state.sessions[sessionId]) { state.sessions[sessionId].status = 'closed'; await writeState(state); }
    return state.sessions[sessionId];
  }
  // Existing local path — unchanged
  const session = state.sessions[sessionId];
  if (!session) throw new Error('Session not found');
  // ... keep existing local code
}

async function removeGuest(sessionId, guestId) {
  const state = await readState();
  await requireSessionOwnerAccess(state, sessionId);
  const api = global.WebCommentApiClient;
  if (api && state.sessions[sessionId]?.accessMode !== 'local_legacy') {
    const token = state.access[sessionId]?.token;
    await api.removeGuest(guestId, token);
    if (state.sessionGuests[guestId]) { state.sessionGuests[guestId].status = 'removed'; await writeState(state); }
    return state.sessionGuests[guestId];
  }
  // Existing local path — unchanged
  const session = state.sessions[sessionId];
  if (!session) throw new Error('Session not found');
  // ... keep existing local code
}

async function changeSessionPassword(sessionId, password) {
  const helpers = requireAccessHelpers();
  const state = await readState();
  await requireSessionOwnerAccess(state, sessionId);
  const api = global.WebCommentApiClient;
  if (api && state.sessions[sessionId]?.accessMode !== 'local_legacy') {
    const token = state.access[sessionId]?.token;
    const passwordHash = await helpers.hashSecret(password);
    await api.changePassword(sessionId, passwordHash, token);
    return state.sessions[sessionId];
  }
  // Existing local path — unchanged
  const session = state.sessions[sessionId];
  if (!session) throw new Error('Session not found');
  // ... keep existing local code
}

async function resetInviteLink(sessionId, pageContext) {
  const helpers = requireAccessHelpers();
  const state = await readState();
  await requireSessionOwnerAccess(state, sessionId);
  const api = global.WebCommentApiClient;
  if (api && state.sessions[sessionId]?.accessMode !== 'local_legacy') {
    const invite = await helpers.createCapability('invite');
    const token = state.access[sessionId]?.token;
    await api.resetInviteLink(sessionId, invite.hash, token);
    return {
      inviteSecret: invite.token,
      inviteLink: buildInviteLink(sessionId, invite.token, pageContext),
    };
  }
  // Existing local path — unchanged
  const session = state.sessions[sessionId];
  if (!session) throw new Error('Session not found');
  // ... keep existing local code
}
```

- [ ] **Step 5: Run all tests**

```bash
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/store.js tests/store-remote.test.mjs
git commit -m "feat: admin ops (close, removeGuest, changePassword, resetInviteLink, setThreadResolved, updatePinAnchor) use supabase"
```

---

## Task 9: `content-script.js` — Realtime Subscription Lifecycle

**Files:**
- Modify: `src/content/content-script.js`

**Interfaces:**
- Consumes: `window.WebCommentRealtimeClient.subscribe`, `broadcast`, `unsubscribe`.
- Produces: when overlay activates with a non-`local_legacy` session, subscribes to `session:{sessionId}` and wires `PIN_CREATED`, `COMMENT_CREATED`, `THREAD_RESOLVED`, `THREAD_REOPENED` handlers; unsubscribes on deactivate.

- [ ] **Step 1: Write tests in `tests/comment-mode-ui.test.mjs`**

Add to the existing test file:

```js
test('content script wires realtime subscription after overlay activation', () => {
  assert.match(content, /WebCommentRealtimeClient/);
  assert.match(content, /subscribe\(/);
  assert.match(content, /PIN_CREATED/);
  assert.match(content, /COMMENT_CREATED/);
  assert.match(content, /THREAD_RESOLVED/);
  assert.match(content, /THREAD_REOPENED/);
});

test('content script unsubscribes realtime on overlay deactivate', () => {
  const deactivateSource = sourceBetween('function deactivateOverlay', 'function renderToolbar');
  assert.match(deactivateSource, /WebCommentRealtimeClient/);
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
node --test tests/comment-mode-ui.test.mjs
```

Expected: the two new assertions fail.

- [ ] **Step 3: Add Realtime subscription to `content-script.js`**

Find the `activateOverlay` function (or wherever `refreshData` is called on session activation) and add:

```js
function subscribeRealtime(sessionId) {
  if (!window.WebCommentRealtimeClient) return;
  window.WebCommentRealtimeClient.subscribe(sessionId)
    .on('PIN_CREATED', (payload) => {
      if (!payload) return;
      refreshData();
    })
    .on('COMMENT_CREATED', (payload) => {
      if (!payload) return;
      refreshData();
    })
    .on('THREAD_RESOLVED', (payload) => {
      if (!payload) return;
      refreshData();
    })
    .on('THREAD_REOPENED', (payload) => {
      if (!payload) return;
      refreshData();
    });
}
```

Call `subscribeRealtime(sessionId)` in the overlay activation path, after the session is known and `refreshData()` is first called. Use the active session id from `WebCommentStore.getActiveSessionId()`.

- [ ] **Step 4: Add unsubscribe to `deactivateOverlay` in `content-script.js`**

Find the `deactivateOverlay` function and add before `root.remove()`:

```js
if (window.WebCommentRealtimeClient && state.sessionId) {
  window.WebCommentRealtimeClient.unsubscribe(state.sessionId);
}
```

- [ ] **Step 5: Run tests**

```bash
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/content/content-script.js tests/comment-mode-ui.test.mjs
git commit -m "feat: subscribe to supabase realtime channel on overlay activate, unsubscribe on deactivate"
```

---

## Task 10: Replace Placeholder Supabase Credentials and Manual Smoke Test

**Files:**
- Modify: `src/shared/api-client.js` (replace `REPLACE_WITH_PROJECT_REF` and `REPLACE_WITH_ANON_KEY`)

**Interfaces:**
- Produces: Extension connects to the real Supabase project; A/B collaboration works end-to-end.

- [ ] **Step 1: Fill in Supabase credentials in `api-client.js`**

In `src/shared/api-client.js`, replace:
```js
const SUPABASE_URL = 'https://REPLACE_WITH_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_ANON_KEY';
```

With your actual project values from Supabase Settings → API.

- [ ] **Step 2: Reload the extension in Chrome**

Go to `chrome://extensions` → click Reload on WebComment.

- [ ] **Step 3: A/B smoke test**

Open two Chrome windows (or two browsers) on the same URL (e.g., `https://example.com`).

**Browser A (Owner):**
1. Open WebComment popup → Create Review Session → set name + password → confirm.
2. Copy the invite link shown.
3. Click into the page → drop a comment pin.

**Browser B (Guest):**
1. Open the invite link.
2. Enter the password and a display name → join.
3. Navigate to the same URL (`https://example.com`) in the extension.

Verify:
- Browser B sees Browser A's pin without reloading.
- Browser B drops a reply → Browser A sees it within 1–2 seconds without reloading.
- Refresh both browsers → both still see all comments.

- [ ] **Step 4: Final commit**

```bash
git add src/shared/api-client.js
git commit -m "feat: configure real supabase credentials for a/b realtime collaboration"
```
