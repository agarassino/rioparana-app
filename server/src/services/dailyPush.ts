import type { Pool } from 'pg';
import { getStationById } from '../config/stations.js';
import { getWaterLevel } from '../stores/riverStore.js';
import { getHistory } from '../stores/riverHistory.js';
import { recordNotification, savePushToken, subscribers } from '../stores/pushStore.js';
import { composeDaily, type DigestChange } from './dailyDigest.js';

// The daily send.
//
// Expo's push service rather than Firebase directly: it needs no console
// project, it is what expo-notifications already talks to, and the token the
// app registers is already an Expo one.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request.
const BATCH = 100;

const HOUR = 3600_000;
const MIN_SPAN_H = 12;
const MAX_SPAN_H = 36;

export interface DigestResult {
  sent: number;
  /** Nothing honest to say: no station, or a reading too old to be today. */
  skipped: number;
  failed: number;
}

interface Pending {
  deviceId: string;
  stationId: string;
  pushToken: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * How far the river moved over roughly the last day.
 * Kept here rather than imported from the app: the server has its own history
 * store, and this is three lines of arithmetic over it.
 */
async function dayChange(pool: Pool, stationId: string, now: Date): Promise<DigestChange | null> {
  const points = await getHistory(pool, stationId, now);
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const latestAt = new Date(latest.timestamp).getTime();
  const target = latestAt - 24 * HOUR;

  let ref = null as (typeof points)[number] | null;
  for (const p of points.slice(0, -1)) {
    const at = new Date(p.timestamp).getTime();
    if (ref === null || Math.abs(at - target) < Math.abs(new Date(ref.timestamp).getTime() - target)) {
      ref = p;
    }
  }
  if (!ref) return null;

  const span = (latestAt - new Date(ref.timestamp).getTime()) / HOUR;
  if (span < MIN_SPAN_H || span > MAX_SPAN_H) return null;

  return { cm: Math.round((latest.level - ref.level) * 100), hours: Math.round(span) };
}

export async function sendDailyDigest(
  pool: Pool,
  opts: { now?: Date; fetchFn?: typeof fetch } = {},
): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? fetch;

  const result: DigestResult = { sent: 0, skipped: 0, failed: 0 };
  const pending: Pending[] = [];

  for (const sub of await subscribers(pool)) {
    // A device that has never opened a station has no river to report on.
    // Choosing one would send a reading from the wrong end of the country.
    if (!sub.stationId) {
      result.skipped++;
      continue;
    }

    const station = getStationById(sub.stationId);
    const level = await getWaterLevel(pool, sub.stationId);
    if (!station || !level) {
      result.skipped++;
      continue;
    }

    const message = composeDaily(
      station.name,
      {
        level: level.level,
        timestamp: new Date(level.timestamp).toISOString(),
        alertLevel: level.alertLevel,
        evacuationLevel: level.evacuationLevel,
      },
      await dayChange(pool, sub.stationId, now),
      now,
    );

    // composeDaily returns null when the reading is too old to head a
    // notification the reader will take as today's.
    if (!message) {
      result.skipped++;
      continue;
    }

    pending.push({ ...message, deviceId: sub.deviceId, stationId: sub.stationId, pushToken: sub.pushToken });
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    await deliver(pool, pending.slice(i, i + BATCH), fetchFn, now, result);
  }

  return result;
}

async function deliver(
  pool: Pool,
  batch: Pending[],
  fetchFn: typeof fetch,
  now: Date,
  result: DigestResult,
): Promise<void> {
  let tickets: Array<{ status?: string; details?: { error?: string } }>;

  try {
    const res = await fetchFn(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        batch.map((p) => ({ to: p.pushToken, title: p.title, body: p.body, data: p.data })),
      ),
    });
    if (!res.ok) throw new Error(`push endpoint returned ${res.status}`);

    const body = (await res.json()) as { data?: typeof tickets };
    tickets = body.data ?? [];
  } catch {
    // A send that never happened must leave no record: a row in the list the
    // reader was never notified about makes the screen lie.
    result.failed += batch.length;
    return;
  }

  for (const [i, p] of batch.entries()) {
    const ticket = tickets[i];

    if (ticket?.status === 'ok') {
      await recordNotification(pool, p.deviceId, p.stationId, p.title, p.body, now);
      result.sent++;
      continue;
    }

    result.failed++;
    // The app was uninstalled or the token revoked. Left in place, it is paid
    // for on every run forever.
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await savePushToken(pool, p.deviceId, null, now);
    }
  }
}
