import { withTransaction } from '../db/transaction.js';
// server/src/services/ownerEmail.ts
import type { Pool } from 'pg';
import { getStationById } from '../config/stations.js';
import { preview, type FeedbackKind } from '../stores/feedbackStore.js';
import { getJobState, saveJobState } from '../stores/jobState.js';

// The owner hears about new messages by email, at most every 15 minutes. The
// exact selected message IDs are acknowledged only after Resend accepts them.
// A timestamp cursor could skip equal-time or late-committed messages forever.

export const EMAIL_JOB = 'owner_email';
export const EMAIL_DEBOUNCE_MS = 15 * 60_000;
export const MAX_THREADS_IN_EMAIL = 20;
export const RESEND_URL = 'https://api.resend.com/emails';

const KIND_LABELS: Record<FeedbackKind, string> = { suggestion: 'Sugerencia', bug: 'Error', question: 'Consulta' };

export interface OwnerEmailConfig {
  apiKey: string;
  to: string;
  from: string;
  adminBaseUrl: string;
  fetchFn?: typeof fetch;
}

export interface PendingThread {
  threadId: string;
  kind: FeedbackKind;
  stationId: string | null;
  count: number;
  /** The first of the new messages in this thread. */
  firstBody: string;
}

export interface PendingEmail {
  total: number;
  messageIds: string[];
  newest: Date | null;
  threads: PendingThread[];
}

export interface EmailTickResult {
  status: 'sent' | 'nothing_new' | 'debounced' | 'failed';
  messages: number;
}

export function ownerEmailConfigFromEnv(env: {
  resendApiKey: string | null;
  feedbackNotifyEmail: string;
  feedbackFromEmail: string;
  adminBaseUrl: string;
}): OwnerEmailConfig | null {
  if (!env.resendApiKey) return null;
  return { apiKey: env.resendApiKey, to: env.feedbackNotifyEmail, from: env.feedbackFromEmail, adminBaseUrl: env.adminBaseUrl };
}

export async function pendingForEmail(pool: Pool): Promise<PendingEmail> {
  const res = await pool.query(
    `SELECT m.id, m.thread_id, m.body, m.created_at, t.kind, t.station_id
       FROM feedback_messages m JOIN feedback_threads t ON t.id = m.thread_id
      WHERE m.author = 'device' AND m.owner_emailed_at IS NULL
      ORDER BY m.created_at ASC`,
  );

  const threads = new Map<string, PendingThread>();
  let newest: Date | null = null;
  for (const r of res.rows) {
    const id = String(r.thread_id);
    const existing = threads.get(id);
    if (existing) existing.count++;
    else threads.set(id, { threadId: id, kind: r.kind as FeedbackKind, stationId: r.station_id == null ? null : String(r.station_id), count: 1, firstBody: String(r.body) });
    newest = new Date(r.created_at);
  }
  return { total: res.rows.length, messageIds: res.rows.map((r) => String(r.id)), newest, threads: [...threads.values()] };
}

export function composeOwnerEmail(p: PendingEmail, adminBaseUrl: string): { subject: string; text: string } {
  const shown = p.threads.slice(0, MAX_THREADS_IN_EMAIL);
  const blocks = shown.map((t) => {
    const station = t.stationId ? getStationById(t.stationId)?.name ?? t.stationId : 'Sin estación';
    return [
      `[${KIND_LABELS[t.kind]}] ${station} · ${t.count} mensaje(s)`,
      preview(t.firstBody),
      `${adminBaseUrl}/admin/threads/${t.threadId}`,
    ].join('\n');
  });
  const hidden = p.threads.length - shown.length;
  const lines = [`${p.total} mensaje(s) nuevo(s) en Paraná Info.`, '', blocks.join('\n\n')];
  if (hidden > 0) lines.push('', `…y ${hidden} conversación(es) más.`);
  lines.push('', `Bandeja: ${adminBaseUrl}/admin`);
  return { subject: `Paraná Info: ${p.total} mensaje(s) nuevo(s)`, text: lines.join('\n') };
}

async function sendViaResend(cfg: OwnerEmailConfig, subject: string, text: string): Promise<boolean> {
  try {
    const res = await (cfg.fetchFn ?? fetch)(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runOwnerEmailTick(pool: Pool, cfg: OwnerEmailConfig, now: Date = new Date()): Promise<EmailTickResult> {
  const state = await getJobState(pool, EMAIL_JOB);
  const pending = await pendingForEmail(pool);
  if (pending.total === 0) return { status: 'nothing_new', messages: 0 };
  if (state.ranAt && now.getTime() - state.ranAt.getTime() < EMAIL_DEBOUNCE_MS) {
    return { status: 'debounced', messages: pending.total };
  }

  const { subject, text } = composeOwnerEmail(pending, cfg.adminBaseUrl);
  if (!(await sendViaResend(cfg, subject, text))) return { status: 'failed', messages: pending.total };

  // Ack and debounce state commit together. A crash after external acceptance
  // but before COMMIT may resend (at-least-once), but cannot drop a message.
  await withTransaction(pool, async (client) => {
    // Bounded parameterized chunks avoid the PostgreSQL parameter ceiling.
    for (let offset = 0; offset < pending.messageIds.length; offset += 1000) {
      const ids = pending.messageIds.slice(offset, offset + 1000);
      const slots = ids.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(`UPDATE feedback_messages SET owner_emailed_at = $${ids.length + 1} WHERE id IN (${slots})`, [...ids, now.toISOString()]);
    }
    await saveJobState(client, EMAIL_JOB, { mark: pending.newest, ranAt: now });
  });
  return { status: 'sent', messages: pending.total };
}
