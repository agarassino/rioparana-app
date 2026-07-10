import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { replaceNews, getNews } from '../../src/stores/newsStore.js';
import type { Pool } from 'pg';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('newsStore', () => {
  it('replaces and reads news', async () => {
    await replaceNews(pool, [
      { id: '/noticias/a', title: 'A', date: 'd1', url: 'https://x/a' },
      { id: '/noticias/b', title: 'B', date: 'd2', url: 'https://x/b' },
    ]);
    const items = await getNews(pool);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['/noticias/a', '/noticias/b']);
  });

  it('replace clears previous rows', async () => {
    await replaceNews(pool, [{ id: '/noticias/old', title: 'Old', date: 'd', url: 'https://x/old' }]);
    await replaceNews(pool, [{ id: '/noticias/new', title: 'New', date: 'd', url: 'https://x/new' }]);
    const items = await getNews(pool);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('/noticias/new');
  });
});
