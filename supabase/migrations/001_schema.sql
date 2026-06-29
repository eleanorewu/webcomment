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
