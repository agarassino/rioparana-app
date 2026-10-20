// server/src/services/replyPush.ts
import type { Pool } from 'pg';
import { savePushToken } from '../stores/pushStore.js';
import { sendPush, type PushOutcome } from './expoPush.js';

export const REPLY_PUSH_TITLE = 'Paraná Info';
// Never the reply itself: a lock screen is not a private place.
export const REPLY_PUSH_BODY = 'Tenés una respuesta a tu mensaje';

export async function notifyReply(
  pool: Pool,
  threadId: string,
  deps: { fetchFn?: typeof fetch; now?: Date } = {},
): Promise<PushOutcome | 'no_token'> {
  const res = await pool.query(
    `SELECT d.device_id, d.push_token
       FROM feedback_threads t JOIN devices d ON d.device_id = t.device_id
      WHERE t.id = $1`,
    [threadId],
  );
  const row = res.rows[0];
  // No token: the reply still lands, and the unread dot covers it next time
  // the reader opens the screen.
  if (!row?.push_token) return 'no_token';

  const outcome = await sendPush(
    {
      to: String(row.push_token),
      title: REPLY_PUSH_TITLE,
      body: REPLY_PUSH_BODY,
      data: { type: 'feedback_reply', threadId },
    },
    deps.fetchFn,
  );
  if (outcome === 'device_not_registered') {
    await savePushToken(pool, String(row.device_id), null, deps.now ?? new Date());
  }
  return outcome;
}
