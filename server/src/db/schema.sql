CREATE TABLE IF NOT EXISTS water_levels (
  station_id  text PRIMARY KEY,
  level       numeric NOT NULL,
  trend       text NOT NULL,
  change_rate numeric NOT NULL,
  timestamp   timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS news (
  id         text PRIMARY KEY,
  title      text NOT NULL,
  date       text,
  url        text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS weather_cache (
  lat_bucket numeric NOT NULL,
  lon_bucket numeric NOT NULL,
  data       jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (lat_bucket, lon_bucket)
);

CREATE TABLE IF NOT EXISTS devices (
  device_id  uuid PRIMARY KEY,
  first_seen timestamptz NOT NULL,
  last_seen  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS device_station_views (
  device_id      uuid NOT NULL,
  station_id     text NOT NULL,
  view_count     integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz NOT NULL,
  PRIMARY KEY (device_id, station_id)
);

-- Reference heights published by Prefectura for each station. Added after the
-- table shipped, so they must be applied to existing databases too.
ALTER TABLE water_levels ADD COLUMN IF NOT EXISTS alert_level numeric;
ALTER TABLE water_levels ADD COLUMN IF NOT EXISTS evacuation_level numeric;

-- Append-only history. water_levels keeps one row per station and overwrites
-- it, which answers "what is the river now" but never "what has it been doing".
CREATE TABLE IF NOT EXISTS water_level_history (
  station_id text NOT NULL,
  timestamp  timestamptz NOT NULL,
  level      numeric NOT NULL,
  PRIMARY KEY (station_id, timestamp)
);

-- Push. The token belongs to the device row it already has: one device, one
-- token, replaced whenever Expo issues a new one.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS push_token_at timestamptz;

-- What was actually sent. The app reads this back rather than keeping its own
-- copy, so the list survives a reinstall and matches what the server believes
-- it sent.
CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  device_id  uuid NOT NULL,
  station_id text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  sent_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_device_sent
  ON notifications (device_id, sent_at DESC);

-- Per-device credential (2.2.0+). Only the SHA-256 of the token is kept, as
-- lower-case hex: the token is 256 random bits, so a slow hash adds nothing,
-- and pg-mem cannot round-trip bytea. NULLs do not collide in the index.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS token_issued_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS devices_token_hash ON devices (token_hash);

-- In-app feedback. A thread belongs to one device; its messages go with it.
CREATE TABLE IF NOT EXISTS feedback_threads (
  id            uuid PRIMARY KEY,
  device_id     uuid NOT NULL REFERENCES devices (device_id),
  kind          text NOT NULL CHECK (kind IN ('suggestion','bug','question')),
  station_id    text NULL,
  app_version   text NOT NULL,
  os_version    text NOT NULL,
  status        text NOT NULL CHECK (status IN ('open','answered','archived')),
  unread_device boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_threads_device
  ON feedback_threads (device_id, updated_at DESC);

-- char_length counts code points, so an emoji is one character here exactly
-- as it is in the validation that runs before the insert.
CREATE TABLE IF NOT EXISTS feedback_messages (
  id         uuid PRIMARY KEY,
  thread_id  uuid NOT NULL REFERENCES feedback_threads (id) ON DELETE CASCADE,
  author     text NOT NULL CHECK (author IN ('device','admin')),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_messages_thread
  ON feedback_messages (thread_id, created_at);

-- Append-only record of what the owner did in the admin. No code path updates
-- or deletes it; production also revokes those privileges (DEPLOY-COOLIFY.md).
CREATE TABLE IF NOT EXISTS admin_audit (
  id        bigserial PRIMARY KEY,
  action    text NOT NULL,
  thread_id uuid NULL,
  at        timestamptz NOT NULL
);

-- Marks for periodic jobs, so a restart neither re-sends nor forgets.
CREATE TABLE IF NOT EXISTS job_state (
  name   text PRIMARY KEY,
  mark   timestamptz NULL,
  ran_at timestamptz NULL
);

-- Exact-message owner email acknowledgement: timestamps are not commit cursors.
ALTER TABLE feedback_messages ADD COLUMN IF NOT EXISTS owner_emailed_at timestamptz;
CREATE INDEX IF NOT EXISTS feedback_messages_owner_email
  ON feedback_messages (author, owner_emailed_at);
