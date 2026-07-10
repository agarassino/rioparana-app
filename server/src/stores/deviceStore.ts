import type { Pool } from 'pg';

export async function pingDevice(
  pool: Pool,
  deviceId: string,
  stationId?: string,
  now: Date = new Date()
): Promise<void> {
  const ts = now.toISOString();
  await pool.query(
    `INSERT INTO devices (device_id, first_seen, last_seen)
     VALUES ($1,$2,$2)
     ON CONFLICT (device_id) DO UPDATE SET last_seen=$2`,
    [deviceId, ts]
  );

  if (stationId) {
    await pool.query(
      `INSERT INTO device_station_views (device_id, station_id, view_count, last_viewed_at)
       VALUES ($1,$2,1,$3)
       ON CONFLICT (device_id, station_id) DO UPDATE SET
         view_count = device_station_views.view_count + 1,
         last_viewed_at = $3`,
      [deviceId, stationId, ts]
    );
  }
}
