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

  it('throws error on mid-transaction failure', async () => {
    // Seed with a good item
    await replaceNews(pool, [{ id: '/noticias/old', title: 'Old', date: 'd', url: 'https://x/old' }]);

    // Verify seeded data exists
    let items = await getNews(pool);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('/noticias/old');

    // Create a wrapper around pool.connect that injects errors mid-transaction
    const originalConnect = pool.connect;
    let insertsSeen = 0;

    pool.connect = async function () {
      const client = await originalConnect.call(this);
      const originalQuery = client.query;

      client.query = async function (query: any, params?: any[]) {
        const queryStr = typeof query === 'string' ? query : (query?.text || '');

        // Check if this is an INSERT statement
        if (queryStr.includes('INSERT')) {
          insertsSeen++;
          // Throw error on second INSERT to simulate constraint violation
          if (insertsSeen === 2) {
            throw new Error('Simulated constraint violation during INSERT');
          }
        }
        // Call the original query method
        return originalQuery.call(this, query, params);
      };

      return client;
    };

    // Attempt to replace with a batch of 2 items
    // The second INSERT will fail, triggering ROLLBACK in replaceNews
    const batchWithError = [
      { id: '/noticias/new', title: 'New', date: 'd', url: 'https://x/new' },
      { id: '/noticias/fail', title: 'Fail', date: 'd', url: 'https://x/fail' },
    ];

    // Assert that replaceNews throws (error handling in the try-catch works)
    await expect(replaceNews(pool, batchWithError)).rejects.toThrow('Simulated constraint violation');
  });
});
