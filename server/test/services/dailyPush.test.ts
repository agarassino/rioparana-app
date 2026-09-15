import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { pingDevice } from '../../src/stores/deviceStore.js';
import { upsertWaterLevel } from '../../src/stores/riverStore.js';
import { recordReading } from '../../src/stores/riverHistory.js';
import { getNotifications, savePushToken, subscribers } from '../../src/stores/pushStore.js';
import { sendDailyDigest } from '../../src/services/dailyPush.js';
import type { Pool } from 'pg';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

let pool: Pool;
let sent: Array<Record<string, unknown>>;

/** An Expo push endpoint that accepts everything. */
const acceptAll = () =>
  vi.fn(async (_url: string, init: RequestInit) => {
    const batch = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
    sent.push(...batch);
    return {
      ok: true,
      json: async () => ({ data: batch.map(() => ({ status: 'ok' })) }),
    };
  });

async function givenReading(stationId: string, level: number, hours = 2) {
  await upsertWaterLevel(pool, {
    stationId,
    level,
    trend: 'stable',
    changeRate: 0,
    timestamp: hoursAgo(hours).toISOString(),
    alertLevel: 5,
    evacuationLevel: 5.3,
  });
  await recordReading(pool, stationId, hoursAgo(26).toISOString(), level - 0.06);
  await recordReading(pool, stationId, hoursAgo(hours).toISOString(), level);
}

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
  sent = [];
});

describe('sendDailyDigest', () => {
  it('sends one notification per subscriber, about their own station', async () => {
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    const fetchFn = acceptAll();
    const result = await sendDailyDigest(pool, { now: NOW, fetchFn: fetchFn as never });

    expect(result.sent).toBe(1);
    expect(sent[0].to).toBe(TOKEN_A);
    expect(sent[0].title).toBe('Rosario · 2.54 m');
  });

  it('carries what the river did since yesterday', async () => {
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    await sendDailyDigest(pool, { now: NOW, fetchFn: acceptAll() as never });

    expect(String(sent[0].body)).toContain('Subió 6 cm desde ayer');
  });

  it('keeps a record the app can read back', async () => {
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    await sendDailyDigest(pool, { now: NOW, fetchFn: acceptAll() as never });

    const rows = await getNotifications(pool, A);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Rosario · 2.54 m');
    expect(rows[0].stationId).toBe('rosario');
  });

  it('skips a device that has never opened a station', async () => {
    // Nothing to report on. Picking one for them would send a reading from the
    // wrong end of the country.
    //
    // Readings exist for two stations here on purpose: without them the device
    // would be skipped for want of data, and this would pass while a default
    // station was being handed out.
    await givenReading('rosario', 2.54);
    await givenReading('goya', 3.1);
    await savePushToken(pool, A, TOKEN_A, NOW);

    const result = await sendDailyDigest(pool, { now: NOW, fetchFn: acceptAll() as never });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(sent).toEqual([]);
  });

  it('skips a station whose reading is too old to be today', async () => {
    // The pusher runs from one laptop. A notification headed "today" carrying
    // a two-day-old height is worse than no notification.
    await givenReading('rosario', 2.54, 40);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    const result = await sendDailyDigest(pool, { now: NOW, fetchFn: acceptAll() as never });

    expect(result.sent).toBe(0);
    expect(sent).toEqual([]);
  });

  it('sends nothing at all when nobody has registered', async () => {
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');

    const fetchFn = acceptAll();
    await sendDailyDigest(pool, { now: NOW, fetchFn: fetchFn as never });

    // Not an empty request: no request.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('records nothing when the push endpoint rejects the batch', async () => {
    // A row in the list the reader never got a notification for would make the
    // screen lie about what happened.
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    const failing = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const result = await sendDailyDigest(pool, { now: NOW, fetchFn: failing as never });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(await getNotifications(pool, A)).toEqual([]);
  });

  it('survives an endpoint that throws', async () => {
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    const throwing = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(
      sendDailyDigest(pool, { now: NOW, fetchFn: throwing as never }),
    ).resolves.toMatchObject({ sent: 0, failed: 1 });
  });

  it('forgets a token Expo says is dead', async () => {
    // Uninstalled apps keep their token in the table forever otherwise, and
    // every run pays to be told again.
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    const rejecting = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }),
    }));
    await sendDailyDigest(pool, { now: NOW, fetchFn: rejecting as never });

    expect(await subscribers(pool)).toEqual([]);
    expect(await getNotifications(pool, A)).toEqual([]);
  });

  it('keeps a token when the failure was not about the device', async () => {
    await givenReading('rosario', 2.54);
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    const rateLimited = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] }),
    }));
    await sendDailyDigest(pool, { now: NOW, fetchFn: rateLimited as never });

    expect(await subscribers(pool)).toHaveLength(1);
  });

  it('one bad reading does not cost the other subscribers their notification', async () => {
    await givenReading('rosario', 2.54);
    await givenReading('goya', 3.1, 40); // stale
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);
    await pingDevice(pool, B, 'goya');
    await savePushToken(pool, B, TOKEN_B, NOW);

    const result = await sendDailyDigest(pool, { now: NOW, fetchFn: acceptAll() as never });

    expect(result.sent).toBe(1);
    expect(sent.map((m) => m.to)).toEqual([TOKEN_A]);
  });
});
