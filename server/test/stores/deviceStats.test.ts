import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { pingDevice } from '../../src/stores/deviceStore.js';
import { getDeviceStats } from '../../src/stores/deviceStats.js';
import { recordNotification, savePushToken } from '../../src/stores/pushStore.js';
import type { Pool } from 'pg';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('getDeviceStats', () => {
  it('reports zeroes before anything has been recorded', async () => {
    const stats = await getDeviceStats(pool, NOW);

    expect(stats.devices).toBe(0);
    expect(stats.activeLast7Days).toBe(0);
    expect(stats.stations).toEqual([]);
  });

  it('counts each device once however often it pings', async () => {
    await pingDevice(pool, A, 'rosario', NOW);
    await pingDevice(pool, A, 'rosario', NOW);
    await pingDevice(pool, B, 'goya', NOW);

    expect((await getDeviceStats(pool, NOW)).devices).toBe(2);
  });

  it('separates devices seen this week from the ones that left', async () => {
    await pingDevice(pool, A, 'rosario', NOW);
    await pingDevice(pool, B, 'goya', daysAgo(30));

    const stats = await getDeviceStats(pool, NOW);

    expect(stats.devices).toBe(2);
    expect(stats.activeLast7Days).toBe(1);
  });

  it('ranks stations by how many times they were opened', async () => {
    await pingDevice(pool, A, 'rosario', NOW);
    await pingDevice(pool, A, 'rosario', NOW);
    await pingDevice(pool, B, 'rosario', NOW);
    await pingDevice(pool, C, 'goya', NOW);

    const stats = await getDeviceStats(pool, NOW);

    expect(stats.stations[0]).toMatchObject({ stationId: 'rosario', views: 3, devices: 2 });
    expect(stats.stations[1]).toMatchObject({ stationId: 'goya', views: 1, devices: 1 });
  });

  it('counts a device that opens the app without picking a station', async () => {
    await pingDevice(pool, A, undefined, NOW);

    const stats = await getDeviceStats(pool, NOW);

    expect(stats.devices).toBe(1);
    expect(stats.stations).toEqual([]);
  });
});

describe('notification reach', () => {
  const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

  it('counts nobody as reachable before anyone registers', async () => {
    await pingDevice(pool, A, 'rosario');

    const stats = await getDeviceStats(pool, NOW);
    expect(stats.push.subscribers).toBe(0);
    expect(stats.push.sentLast7Days).toBe(0);
    expect(stats.push.lastSentAt).toBeNull();
  });

  it('counts the devices that can actually be reached', async () => {
    await pingDevice(pool, A, 'rosario');
    await pingDevice(pool, B, 'goya');
    await savePushToken(pool, A, TOKEN, NOW);

    expect((await getDeviceStats(pool, NOW)).push.subscribers).toBe(1);
  });

  it('stops counting a device that turned notifications off', async () => {
    await savePushToken(pool, A, TOKEN, NOW);
    await savePushToken(pool, A, null, NOW);

    expect((await getDeviceStats(pool, NOW)).push.subscribers).toBe(0);
  });

  it('counts what went out this week, and says when the last one did', async () => {
    await recordNotification(pool, A, 'rosario', 'T', 'B', daysAgo(1));
    await recordNotification(pool, B, 'goya', 'T', 'B', daysAgo(2));

    const stats = await getDeviceStats(pool, NOW);
    expect(stats.push.sentLast7Days).toBe(2);
    expect(stats.push.lastSentAt).toBe(daysAgo(1).toISOString());
  });

  it('leaves older sends out of the weekly figure', async () => {
    // The weekly number answers "is this still running", so a send from a
    // month ago must not make a stopped job look healthy.
    await recordNotification(pool, A, 'rosario', 'T', 'B', daysAgo(30));

    const stats = await getDeviceStats(pool, NOW);
    expect(stats.push.sentLast7Days).toBe(0);
    // But the last one is still reported, because "when did this last work"
    // is exactly the question being asked when the weekly figure is zero.
    expect(stats.push.lastSentAt).toBe(daysAgo(30).toISOString());
  });

  it('counts how many separate devices got one this week', async () => {
    await recordNotification(pool, A, 'rosario', 'T', 'B', daysAgo(1));
    await recordNotification(pool, A, 'rosario', 'T', 'B', daysAgo(2));
    await recordNotification(pool, B, 'goya', 'T', 'B', daysAgo(2));

    expect((await getDeviceStats(pool, NOW)).push.reachedLast7Days).toBe(2);
  });
});
