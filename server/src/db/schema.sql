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
