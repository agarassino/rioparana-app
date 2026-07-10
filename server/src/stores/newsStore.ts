import type { Pool } from 'pg';
import { NewsItem } from '../types.js';

export async function replaceNews(pool: Pool, items: NewsItem[], now: Date = new Date()): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM news');
    for (const it of items) {
      await client.query(
        `INSERT INTO news (id, title, date, url, fetched_at) VALUES ($1,$2,$3,$4,$5)`,
        [it.id, it.title, it.date, it.url, now.toISOString()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getNews(pool: Pool, limit = 10): Promise<NewsItem[]> {
  const res = await pool.query(
    `SELECT id, title, date, url FROM news ORDER BY fetched_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({ id: r.id, title: r.title, date: r.date ?? '', url: r.url }));
}
