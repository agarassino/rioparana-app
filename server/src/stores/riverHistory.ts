import type { Pool } from 'pg';

// Every reading kept, so the app can show where the river has been rather than
// only where it is. Prefectura publishes twice a day, so a month of history for
// every station is a few thousand rows.

export const HISTORY_WINDOW_DAYS = 30;

export interface HistoryPoint {
  timestamp: string;
  level: number;
}

export async function recordReading(
  pool: Pool,
  stationId: string,
  timestamp: string,
  level: number
): Promise<void> {
  await pool.query(
    // The same reading arrives from every device that scrapes it, so the
    // primary key absorbs the repeats and a correction overwrites the value.
    `INSERT INTO water_level_history (station_id, timestamp, level)
     VALUES ($1,$2,$3)
     ON CONFLICT (station_id, timestamp) DO UPDATE SET level = $3`,
    [stationId, timestamp, level]
  );
}

export async function getHistory(
  pool: Pool,
  stationId: string,
  now: Date = new Date()
): Promise<HistoryPoint[]> {
  const since = new Date(now.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const res = await pool.query(
    `SELECT timestamp, level FROM water_level_history
     WHERE station_id = $1 AND timestamp >= $2
     ORDER BY timestamp`,
    [stationId, since.toISOString()]
  );

  return res.rows.map((r) => ({
    timestamp: new Date(r.timestamp).toISOString(),
    level: Number(r.level),
  }));
}
