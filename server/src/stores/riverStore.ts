import type { Pool } from 'pg';
import { WaterLevel, StoredWaterLevel, Trend } from '../types.js';

export async function upsertWaterLevel(pool: Pool, wl: WaterLevel, now: Date = new Date()): Promise<void> {
  await pool.query(
    `INSERT INTO water_levels (station_id, level, trend, change_rate, timestamp, updated_at, alert_level, evacuation_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (station_id) DO UPDATE SET
       level=$2, trend=$3, change_rate=$4, timestamp=$5, updated_at=$6,
       -- A client that does not send the reference levels must not erase them.
       alert_level=COALESCE($7, water_levels.alert_level),
       evacuation_level=COALESCE($8, water_levels.evacuation_level)`,
    [
      wl.stationId,
      wl.level,
      wl.trend,
      wl.changeRate,
      wl.timestamp,
      now.toISOString(),
      wl.alertLevel ?? null,
      wl.evacuationLevel ?? null,
    ]
  );
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStored(r: Record<string, unknown>): StoredWaterLevel {
  const alertLevel = optionalNumber(r.alert_level);
  const evacuationLevel = optionalNumber(r.evacuation_level);

  return {
    stationId: r.station_id as string,
    level: Number(r.level),
    trend: r.trend as Trend,
    changeRate: Number(r.change_rate),
    timestamp: new Date(r.timestamp as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    ...(alertLevel !== undefined ? { alertLevel } : {}),
    ...(evacuationLevel !== undefined ? { evacuationLevel } : {}),
  };
}

export async function getAllWaterLevels(pool: Pool): Promise<StoredWaterLevel[]> {
  const res = await pool.query(
    `SELECT station_id, level, trend, change_rate, timestamp, updated_at, alert_level, evacuation_level
     FROM water_levels ORDER BY station_id`
  );
  return res.rows.map(toStored);
}

export async function getWaterLevel(pool: Pool, stationId: string): Promise<StoredWaterLevel | null> {
  const res = await pool.query(
    `SELECT station_id, level, trend, change_rate, timestamp, updated_at, alert_level, evacuation_level
     FROM water_levels WHERE station_id=$1`,
    [stationId]
  );
  if (res.rows.length === 0) return null;
  return toStored(res.rows[0]);
}
