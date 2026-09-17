import type { Pool } from 'pg';

// Reading side of the device ping. Without it the app collects usage nobody
// can look at, which is the same as not collecting it.

const ACTIVE_WINDOW_DAYS = 7;

export interface StationUsage {
  stationId: string;
  views: number;
  devices: number;
}

export interface PushStats {
  /** Devices that registered a token and have not turned it off. */
  subscribers: number;
  sentLast7Days: number;
  /** Distinct devices reached this week: sends divided by people, roughly. */
  reachedLast7Days: number;
  /** When the daily job last managed to send anything, ever. */
  lastSentAt: string | null;
}

export interface DeviceStats {
  devices: number;
  activeLast7Days: number;
  stations: StationUsage[];
  push: PushStats;
}

export async function getDeviceStats(pool: Pool, now: Date = new Date()): Promise<DeviceStats> {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const totals = await pool.query(
    // SUM(CASE ...) rather than COUNT(*) FILTER: the filter clause is not
    // supported everywhere the tests run, and silently counted every row.
    `SELECT COUNT(*) AS devices,
            SUM(CASE WHEN last_seen >= $1 THEN 1 ELSE 0 END) AS active
     FROM devices`,
    [since.toISOString()]
  );

  const push = await pushStats(pool, since);

  const stations = await pool.query(
    `SELECT station_id,
            SUM(view_count)  AS views,
            COUNT(device_id) AS devices
     FROM device_station_views
     GROUP BY station_id
     ORDER BY views DESC, station_id`
  );

  return {
    devices: Number(totals.rows[0]?.devices ?? 0),
    activeLast7Days: Number(totals.rows[0]?.active ?? 0),
    push,
    stations: stations.rows.map((r) => ({
      stationId: r.station_id as string,
      views: Number(r.views),
      devices: Number(r.devices),
    })),
  };
}

// Whether anyone can be reached, and whether the daily job is still running.
// Separate queries rather than one with aggregates over a join: pg-mem cannot
// plan the joined form, and a store without tests is worse than an extra
// round trip on an endpoint called by hand.
async function pushStats(pool: Pool, since: Date): Promise<PushStats> {
  const subs = await pool.query(
    `SELECT COUNT(*) AS n FROM devices WHERE push_token IS NOT NULL`,
  );

  const recent = await pool.query(
    `SELECT device_id FROM notifications WHERE sent_at >= $1`,
    [since.toISOString()],
  );

  const last = await pool.query(
    `SELECT sent_at FROM notifications ORDER BY sent_at DESC LIMIT 1`,
  );

  return {
    subscribers: Number(subs.rows[0]?.n ?? 0),
    sentLast7Days: recent.rows.length,
    reachedLast7Days: new Set(recent.rows.map((r) => String(r.device_id))).size,
    // Reported even when it is older than the window: "when did this last
    // work" is exactly the question being asked once the weekly figure is zero.
    lastSentAt: last.rows[0] ? new Date(last.rows[0].sent_at).toISOString() : null,
  };
}
