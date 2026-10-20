// server/src/stores/feedbackStore.ts
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db/transaction.js';

// Feedback threads as the device sees them. Ownership is part of every
// device-facing query: a thread is found by its id AND its device, so a
// guessed id from another phone simply does not exist.

export type FeedbackKind = 'suggestion' | 'bug' | 'question';
export type ThreadStatus = 'open' | 'answered' | 'archived';
export type Author = 'device' | 'admin';

export interface FeedbackMessage {
  id: string;
  author: Author;
  body: string;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  kind: FeedbackKind;
  stationId: string | null;
  status: ThreadStatus;
  unread: boolean;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadDetail extends ThreadSummary {
  messages: FeedbackMessage[];
}

export interface NewThread {
  deviceId: string;
  kind: FeedbackKind;
  body: string;
  stationId: string | null;
  appVersion: string;
  osVersion: string;
}

export const PREVIEW_CHARS = 140;
/** A network retry of the same text inside this window is the same message. */
export const DEDUPE_MS = 60_000;

const iso = (v: unknown): string => new Date(v as string).toISOString();

export function preview(body: string): string {
  const points = [...body];
  return points.length <= PREVIEW_CHARS ? body : points.slice(0, PREVIEW_CHARS).join('') + '…';
}

export function toMessage(r: Record<string, unknown>): FeedbackMessage {
  return { id: String(r.id), author: r.author as Author, body: String(r.body), createdAt: iso(r.created_at) };
}

function toSummary(r: Record<string, unknown>, firstBody: string): ThreadSummary {
  return {
    id: String(r.id),
    kind: r.kind as FeedbackKind,
    stationId: r.station_id == null ? null : String(r.station_id),
    status: r.status as ThreadStatus,
    unread: Boolean(r.unread_device),
    preview: preview(firstBody),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function insertMessage(pool: Queryable, threadId: string, author: Author, body: string, now: Date): Promise<FeedbackMessage> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO feedback_messages (id, thread_id, author, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, threadId, author, body, now.toISOString()],
  );
  return { id, author, body, createdAt: now.toISOString() };
}

export async function createThread(pool: Queryable, t: NewThread, now: Date = new Date()): Promise<ThreadDetail> {
  const id = randomUUID();
  const ts = now.toISOString();
  await pool.query(
    `INSERT INTO feedback_threads
       (id, device_id, kind, station_id, app_version, os_version, status, unread_device, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', false, $7, $7)`,
    [id, t.deviceId, t.kind, t.stationId, t.appVersion, t.osVersion, ts],
  );
  const message = await insertMessage(pool, id, 'device', t.body, now);
  return {
    id, kind: t.kind, stationId: t.stationId, status: 'open', unread: false,
    preview: preview(t.body), createdAt: ts, updatedAt: ts, messages: [message],
  };
}

/** A device writing again reopens the thread; an owner reply answers it and flags it unread on the device. */
export async function addMessage(
  pool: Queryable, threadId: string, author: Author, body: string, now: Date = new Date(),
): Promise<FeedbackMessage> {
  const message = await insertMessage(pool, threadId, author, body, now);
  const sql = author === 'device'
    ? `UPDATE feedback_threads SET status = 'open', updated_at = $2 WHERE id = $1`
    : `UPDATE feedback_threads SET status = 'answered', unread_device = true, updated_at = $2 WHERE id = $1`;
  await pool.query(sql, [threadId, now.toISOString()]);
  return message;
}

export async function ownsThread(pool: Queryable, deviceId: string, threadId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT id FROM feedback_threads WHERE id = $1 AND device_id = $2`,
    [threadId, deviceId],
  );
  return res.rows.length === 1;
}

export async function messagesOf(pool: Queryable, threadId: string): Promise<FeedbackMessage[]> {
  const res = await pool.query(
    `SELECT id, author, body, created_at FROM feedback_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  return res.rows.map(toMessage);
}

export async function firstDeviceBodies(pool: Queryable, threadIds: string[]): Promise<Map<string, string>> {
  const first = new Map<string, string>();
  if (threadIds.length === 0) return first;
  const res = await pool.query(
    `SELECT thread_id, body, created_at FROM feedback_messages
      WHERE author = 'device' AND thread_id = ANY($1)
      ORDER BY created_at ASC`,
    [threadIds],
  );
  for (const r of res.rows) {
    const id = String(r.thread_id);
    if (!first.has(id)) first.set(id, String(r.body));
  }
  return first;
}

export async function listThreadsForDevice(pool: Queryable, deviceId: string): Promise<ThreadSummary[]> {
  const res = await pool.query(
    `SELECT id, kind, station_id, status, unread_device, created_at, updated_at
       FROM feedback_threads WHERE device_id = $1 ORDER BY updated_at DESC`,
    [deviceId],
  );
  const firsts = await firstDeviceBodies(pool, res.rows.map((r) => String(r.id)));
  return res.rows.map((r) => toSummary(r, firsts.get(String(r.id)) ?? ''));
}

export async function getThreadForDevice(
  pool: Queryable, deviceId: string, threadId: string, opts: { markRead: boolean } = { markRead: false },
): Promise<ThreadDetail | null> {
  const res = await pool.query(
    `SELECT id, kind, station_id, status, unread_device, created_at, updated_at
       FROM feedback_threads WHERE id = $1 AND device_id = $2`,
    [threadId, deviceId],
  );
  const row = res.rows[0];
  if (!row) return null;

  if (opts.markRead && row.unread_device) {
    await pool.query(
      `UPDATE feedback_threads SET unread_device = false WHERE id = $1 AND device_id = $2`,
      [threadId, deviceId],
    );
  }

  const messages = await messagesOf(pool, threadId);
  const firstDevice = messages.find((m) => m.author === 'device')?.body ?? '';
  return {
    ...toSummary(row, firstDevice),
    unread: opts.markRead ? false : Boolean(row.unread_device),
    messages,
  };
}

/** Rolling-window counts: instants compared, never calendar days, so time zones cannot shift the limit. */
export async function deviceActivitySince(
  pool: Queryable, deviceId: string, since: Date,
): Promise<{ threads: number; messages: number }> {
  const threads = await pool.query(
    `SELECT COUNT(*) AS n FROM feedback_threads WHERE device_id = $1 AND created_at > $2`,
    [deviceId, since.toISOString()],
  );
  const messages = await pool.query(
    `SELECT COUNT(*) AS n FROM feedback_messages m
       JOIN feedback_threads t ON t.id = m.thread_id
      WHERE t.device_id = $1 AND m.author = 'device' AND m.created_at > $2`,
    [deviceId, since.toISOString()],
  );
  return { threads: Number(threads.rows[0]?.n ?? 0), messages: Number(messages.rows[0]?.n ?? 0) };
}

export async function findDuplicateThread(
  pool: Queryable, deviceId: string, kind: FeedbackKind, body: string, now: Date,
): Promise<ThreadDetail | null> {
  const res = await pool.query(
    `SELECT id FROM feedback_threads
      WHERE device_id = $1 AND kind = $2 AND created_at > $3
      ORDER BY created_at DESC`,
    [deviceId, kind, new Date(now.getTime() - DEDUPE_MS).toISOString()],
  );
  const ids = res.rows.map((r) => String(r.id));
  const firsts = await firstDeviceBodies(pool, ids);
  const match = ids.find((id) => firsts.get(id) === body);
  return match ? getThreadForDevice(pool, deviceId, match) : null;
}

export async function findDuplicateMessage(
  pool: Queryable, threadId: string, author: Author, body: string, now: Date,
): Promise<FeedbackMessage | null> {
  const res = await pool.query(
    `SELECT id, author, body, created_at FROM feedback_messages
      WHERE thread_id = $1 AND author = $2 AND body = $3 ORDER BY created_at DESC LIMIT 1`,
    [threadId, author, body],
  );
  const last = res.rows[0];
  if (!last || last.author !== author || last.body !== body) return null;
  return now.getTime() - new Date(last.created_at).getTime() < DEDUPE_MS ? toMessage(last) : null;
}
