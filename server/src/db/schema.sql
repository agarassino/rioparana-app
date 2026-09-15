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
