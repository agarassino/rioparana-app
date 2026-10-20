// server/src/stores/adminAudit.ts
import type { Queryable } from '../db/transaction.js';

// Append-only. This module exports an insert and a read and nothing else; the
// production database role additionally lacks UPDATE/DELETE on the table.
export type AuditAction = 'login' | 'login_failed' | 'reply' | 'archive';

export async function recordAudit(
  pool: Queryable, action: AuditAction, threadId: string | null, at: Date = new Date(),
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit (action, thread_id, at) VALUES ($1, $2, $3)`,
    [action, threadId, at.toISOString()],
  );
}

export async function listAudit(
  pool: Queryable, limit = 100,
): Promise<Array<{ action: AuditAction; threadId: string | null; at: string }>> {
  const res = await pool.query(`SELECT action, thread_id, at FROM admin_audit ORDER BY id ASC LIMIT $1`, [limit]);
  return res.rows.map((r) => ({
    action: r.action as AuditAction,
    threadId: r.thread_id == null ? null : String(r.thread_id),
    at: new Date(r.at).toISOString(),
  }));
}
