// server/src/stores/feedbackAdminStore.ts
import type { Pool } from 'pg';
import { withTransaction } from '../db/transaction.js';
import { recordAudit } from './adminAudit.js';
import {
  addMessage, findDuplicateMessage, firstDeviceBodies, messagesOf, preview,
  type FeedbackKind, type FeedbackMessage, type ThreadStatus,
} from './feedbackStore.js';

// The owner's view: every thread, no ownership filter. Only the admin
// instance, which never listens publicly, imports this module.

export type InboxFilter = 'pending' | 'answered' | 'archived' | 'errors';
export const INBOX_FILTERS: InboxFilter[] = ['pending', 'answered', 'archived', 'errors'];

// Fixed SQL per filter. The filter is a closed union checked by the route,
// never user text, so interpolating one of these four strings is safe.
const WHERE: Record<InboxFilter, string> = {
  pending: `status = 'open'`,
  answered: `status = 'answered'`,
  archived: `status = 'archived'`,
  errors: `kind = 'bug' AND status <> 'archived'`,
};

export interface InboxRow {
  id: string;
  kind: FeedbackKind;
  stationId: string | null;
  status: ThreadStatus;
  preview: string;
  updatedAt: string;
  shortDevice: string;
}

export interface AdminThreadDetail {
  id: string;
  kind: FeedbackKind;
  stationId: string | null;
  status: ThreadStatus;
  appVersion: string;
  osVersion: string;
  shortDevice: string;
  deviceThreadCount: number;
  createdAt: string;
  messages: FeedbackMessage[];
}

export type ReplyResult = 'sent' | 'duplicate' | 'not_found';

const iso = (v: unknown) => new Date(v as string).toISOString();

export async function listInbox(pool: Pool, filter: InboxFilter, limit = 200): Promise<InboxRow[]> {
  const res = await pool.query(
    `SELECT id, device_id, kind, station_id, status, updated_at
       FROM feedback_threads WHERE ${WHERE[filter]}
      ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  const firsts = await firstDeviceBodies(pool, res.rows.map((r) => String(r.id)));
  return res.rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as FeedbackKind,
    stationId: r.station_id == null ? null : String(r.station_id),
    status: r.status as ThreadStatus,
    preview: preview(firsts.get(String(r.id)) ?? ''),
    updatedAt: iso(r.updated_at),
    shortDevice: String(r.device_id).slice(0, 8),
  }));
}

export async function getThreadForAdmin(pool: Pool, threadId: string): Promise<AdminThreadDetail | null> {
  const res = await pool.query(
    `SELECT id, device_id, kind, station_id, status, app_version, os_version, created_at
       FROM feedback_threads WHERE id = $1`,
    [threadId],
  );
  const r = res.rows[0];
  if (!r) return null;
  const count = await pool.query(`SELECT COUNT(*) AS n FROM feedback_threads WHERE device_id = $1`, [r.device_id]);
  return {
    id: String(r.id),
    kind: r.kind as FeedbackKind,
    stationId: r.station_id == null ? null : String(r.station_id),
    status: r.status as ThreadStatus,
    appVersion: String(r.app_version),
    osVersion: String(r.os_version),
    shortDevice: String(r.device_id).slice(0, 8),
    deviceThreadCount: Number(count.rows[0]?.n ?? 0),
    createdAt: iso(r.created_at),
    messages: await messagesOf(pool, threadId),
  };
}

export async function replyAsAdmin(pool: Pool, threadId: string, body: string, now: Date = new Date()): Promise<ReplyResult> {
  return withTransaction(pool, async (client) => {
    const exists = await client.query(`SELECT id FROM feedback_threads WHERE id = $1 FOR UPDATE`, [threadId]);
    if (!exists.rows[0]) return 'not_found';
    // A double-click or a resubmitted form must not answer twice or push twice.
    if (await findDuplicateMessage(client, threadId, 'admin', body, now)) return 'duplicate';
    await addMessage(client, threadId, 'admin', body, now);
    await recordAudit(client, 'reply', threadId, now);
    return 'sent';
  });
}

export async function archiveThread(pool: Pool, threadId: string, now: Date = new Date()): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const res = await client.query(
      `UPDATE feedback_threads SET status = 'archived', updated_at = $2 WHERE id = $1 RETURNING id`,
      [threadId, now.toISOString()],
    );
    if (!res.rows[0]) return false;
    await recordAudit(client, 'archive', threadId, now);
    return true;
  });
}
