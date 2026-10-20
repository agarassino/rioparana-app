// server/src/services/expoPush.ts
// One message through Expo's push service. The daily digest batches; a reply
// is one message to one device, and only its outcome matters.
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type PushOutcome = 'ok' | 'device_not_registered' | 'failed';

export async function sendPush(message: PushMessage, fetchFn: typeof fetch = fetch): Promise<PushOutcome> {
  try {
    const res = await fetchFn(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([message]),
    });
    if (!res.ok) return 'failed';
    const body = (await res.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    const ticket = body.data?.[0];
    if (ticket?.status === 'ok') return 'ok';
    return ticket?.details?.error === 'DeviceNotRegistered' ? 'device_not_registered' : 'failed';
  } catch {
    return 'failed';
  }
}
