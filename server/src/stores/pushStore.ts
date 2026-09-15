import type { Pool } from 'pg';

// Push tokens and the record of what was sent.
//
// The token lives on the device row rather than in a table of its own: one
// device has one token, Expo replaces it rather than adding to it, and turning
// notifications off is the same row with the token gone.

export interface Subscriber {
  deviceId: string;
  pushToken: string;
  /** The station this device actually looks at, or null if it never opened one. */
  stationId: string | null;
}

export interface StoredNotification {
  id: string;
  stationId: string;
  title: string;
  body: string;
  sentAt: string;
}

/** Register, replace, or clear a device's push token. */
export async function savePushToken(
  pool: Pool,
  deviceId: string,
  token: string | null,
  now: Date = new Date(),
): Promise<void> {
  // Permission can be granted before any station is opened, so the device row
  // may not exist yet. Losing the token for that reason would cost a
  // subscriber silently.
  await pool.query(
    `INSERT INTO devices (device_id, first_seen, last_seen, push_token, push_token_at)
     VALUES ($1, $2, $2, $3, $2)
     ON CONFLICT (device_id) DO UPDATE
       SET push_token = $3, push_token_at = $2, last_seen = $2`,
    [deviceId, now.toISOString(), token],
  );
}

/** Every device that can be reached, with the station it cares about. */
export async function subscribers(pool: Pool): Promise<Subscriber[]> {
  // Two flat queries joined here rather than one with a correlated subquery:
  // pg-mem cannot plan the correlated form, and a store that only works against
  // the real database is a store with no tests.
  const devices = await pool.query(
    `SELECT device_id, push_token FROM devices
      WHERE push_token IS NOT NULL ORDER BY device_id`,
  );

  const views = await pool.query(
    `SELECT device_id, station_id, view_count FROM device_station_views
      ORDER BY view_count DESC, station_id`,
  );

  // The station is the one the device has opened most. A tie falls to the id,
  // so the choice is at least stable between runs.
  const top = new Map<string, string>();
  for (const v of views.rows) {
    const id = String(v.device_id);
    if (!top.has(id)) top.set(id, String(v.station_id));
  }

  return devices.rows.map((r) => ({
    deviceId: String(r.device_id),
    pushToken: String(r.push_token),
    stationId: top.get(String(r.device_id)) ?? null,
  }));
}

/** Keep what was sent, so the app can show the list rather than keep its own. */
export async function recordNotification(
  pool: Pool,
  deviceId: string,
  stationId: string,
  title: string,
  body: string,
  sentAt: Date = new Date(),
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (device_id, station_id, title, body, sent_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [deviceId, stationId, title, body, sentAt.toISOString()],
  );
}

/** What this device was sent, newest first. */
export async function getNotifications(
  pool: Pool,
  deviceId: string,
  limit = 50,
): Promise<StoredNotification[]> {
  const res = await pool.query(
    `SELECT id, station_id, title, body, sent_at
       FROM notifications
      WHERE device_id = $1
      ORDER BY sent_at DESC, id DESC
      LIMIT $2`,
    [deviceId, limit],
  );

  return res.rows.map((r) => ({
    id: String(r.id),
    stationId: String(r.station_id),
    title: String(r.title),
    body: String(r.body),
    sentAt: new Date(r.sent_at).toISOString(),
  }));
}
