import type { Pool } from 'pg';

// Reading side of the device ping. Without it the app collects usage nobody
// can look at, which is the same as not collecting it.

const ACTIVE_WINDOW_DAYS = 7;

export interface StationUsage {
  stationId: string;
  views: number;
  devices: number;
}

export interface DeviceStats {
  devices: number;
  activeLast7Days: number;
  stations: StationUsage[];
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
    stations: stations.rows.map((r) => ({
      stationId: r.station_id as string,
      views: Number(r.views),
      devices: Number(r.devices),
    })),
  };
}
