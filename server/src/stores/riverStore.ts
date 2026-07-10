import type { Pool } from 'pg';
import { WaterLevel, StoredWaterLevel, Trend } from '../types.js';

export async function upsertWaterLevel(pool: Pool, wl: WaterLevel, now: Date = new Date()): Promise<void> {
  await pool.query(
    `INSERT INTO water_levels (station_id, level, trend, change_rate, timestamp, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (station_id) DO UPDATE SET
       level=$2, trend=$3, change_rate=$4, timestamp=$5, updated_at=$6`,
    [wl.stationId, wl.level, wl.trend, wl.changeRate, wl.timestamp, now.toISOString()]
  );
}

export async function getWaterLevel(pool: Pool, stationId: string): Promise<StoredWaterLevel | null> {
  const res = await pool.query(
    `SELECT station_id, level, trend, change_rate, timestamp, updated_at
     FROM water_levels WHERE station_id=$1`,
    [stationId]
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    stationId: r.station_id,
    level: Number(r.level),
    trend: r.trend as Trend,
    changeRate: Number(r.change_rate),
    timestamp: new Date(r.timestamp).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
