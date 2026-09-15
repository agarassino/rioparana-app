import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { pingDevice } from '../../src/stores/deviceStore.js';
import {
  getNotifications,
  recordNotification,
  savePushToken,
  subscribers,
} from '../../src/stores/pushStore.js';
import type { Pool } from 'pg';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('savePushToken', () => {
  it('stores the token against a device that already pinged', async () => {
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    expect((await subscribers(pool)).map((s) => s.pushToken)).toEqual([TOKEN_A]);
  });

  it('registers a device that has never pinged', async () => {
    // Permission can be granted before any station is opened, and losing the
    // token because the row does not exist yet would silently cost a
    // subscriber.
    await savePushToken(pool, A, TOKEN_A, NOW);

    expect(await subscribers(pool)).toHaveLength(1);
  });

  it('replaces the token when Expo issues a new one', async () => {
    await savePushToken(pool, A, TOKEN_A, NOW);
    await savePushToken(pool, A, TOKEN_B, NOW);

    const rows = await subscribers(pool);
    expect(rows).toHaveLength(1);
    expect(rows[0].pushToken).toBe(TOKEN_B);
  });

  it('clears the token when a device turns notifications off', async () => {
    await savePushToken(pool, A, TOKEN_A, NOW);
    await savePushToken(pool, A, null, NOW);

    expect(await subscribers(pool)).toEqual([]);
  });
});

describe('subscribers', () => {
  it('ignores devices that never registered a token', async () => {
    await pingDevice(pool, A, 'rosario');
    await pingDevice(pool, B, 'goya');
    await savePushToken(pool, B, TOKEN_B, NOW);

    expect((await subscribers(pool)).map((s) => s.deviceId)).toEqual([B]);
  });

  it('reports the station the device actually looks at', async () => {
    await pingDevice(pool, A, 'goya');
    await pingDevice(pool, A, 'rosario');
    await pingDevice(pool, A, 'rosario');
    await savePushToken(pool, A, TOKEN_A, NOW);

    expect((await subscribers(pool))[0].stationId).toBe('rosario');
  });

  it('has no station for a device that has never opened one', async () => {
    // Registering for notifications says nothing about which river to report.
    // The caller decides what to do; inventing a station here would send
    // somebody a reading from the wrong end of the country.
    await savePushToken(pool, A, TOKEN_A, NOW);

    expect((await subscribers(pool))[0].stationId).toBeNull();
  });
});

describe('notifications', () => {
  it('reads back what was sent to that device, newest first', async () => {
    await savePushToken(pool, A, TOKEN_A, NOW);
    await recordNotification(pool, A, 'rosario', 'Rosario · 2.54 m', 'Subió 6 cm.', NOW);
    await recordNotification(
      pool, A, 'rosario', 'Rosario · 2.60 m', 'Subió 6 cm.',
      new Date(NOW.getTime() + 86400_000),
    );

    const rows = await getNotifications(pool, A);
    expect(rows.map((r) => r.title)).toEqual(['Rosario · 2.60 m', 'Rosario · 2.54 m']);
  });

  it('never shows one device what another was sent', async () => {
    await recordNotification(pool, A, 'rosario', 'A', 'a', NOW);
    await recordNotification(pool, B, 'goya', 'B', 'b', NOW);

    expect((await getNotifications(pool, B)).map((r) => r.title)).toEqual(['B']);
  });

  it('returns an empty list for a device with nothing sent yet', async () => {
    expect(await getNotifications(pool, A)).toEqual([]);
  });

  it('caps how many it returns', async () => {
    for (let i = 0; i < 5; i++) {
      await recordNotification(
        pool, A, 'rosario', `t${i}`, 'b', new Date(NOW.getTime() + i * 1000),
      );
    }

    expect(await getNotifications(pool, A, 3)).toHaveLength(3);
  });
});
