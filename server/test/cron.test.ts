import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../src/db/index.js';
import { getWaterLevel } from '../src/stores/riverStore.js';
import { getNews } from '../src/stores/newsStore.js';
import { refreshRiver, refreshNews } from '../src/cron.js';
import type { Pool } from 'pg';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

const riverHtml = `<td><i></i> 2026-01-16 <i></i> 00:00</td><td>2.77 Mts</td>`;
const newsHtml = `<a href="/noticias/a" class="panel"><time>d</time><h3>A</h3></a>`;

describe('refreshRiver', () => {
  it('stores levels for stations that succeed', async () => {
    const fetchFn = vi.fn(async () => new Response(riverHtml, { status: 200 }));
    const r = await refreshRiver(pool, { fetchFn: fetchFn as any });
    expect(r.updated).toBeGreaterThan(0);
    expect(await getWaterLevel(pool, 'parana')).not.toBeNull();
  });

  it('does not throw when a station fetch fails', async () => {
    const fetchFn = vi.fn(async () => new Response('err', { status: 500 }));
    const r = await refreshRiver(pool, { fetchFn: fetchFn as any });
    expect(r.updated).toBe(0);
  });
});

describe('refreshNews', () => {
  it('replaces news when items parse', async () => {
    const fetchFn = vi.fn(async () => new Response(newsHtml, { status: 200 }));
    await refreshNews(pool, { fetchFn: fetchFn as any });
    expect(await getNews(pool)).toHaveLength(1);
  });

  it('keeps existing news when parse yields nothing', async () => {
    const ok = vi.fn(async () => new Response(newsHtml, { status: 200 }));
    await refreshNews(pool, { fetchFn: ok as any });
    const empty = vi.fn(async () => new Response('<div>nada</div>', { status: 200 }));
    await refreshNews(pool, { fetchFn: empty as any });
    expect(await getNews(pool)).toHaveLength(1);
  });
});
