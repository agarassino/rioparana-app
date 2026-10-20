// src/services/deviceToken.ts
import * as SecureStore from 'expo-secure-store';

import { getDeviceId, rotateDeviceId } from './deviceId';
import { API_BASE_URL, API_KEY, REQUEST_TIMEOUT_MS, withTimeout } from './api/http';

// This install's credential for device-scoped calls. The server hands it out
// once per deviceId and keeps only its hash, so losing it means starting over
// under a new id. Never throws: it runs on app start.

const KEY = 'parana-info.device-token';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

let cached: string | null = null;
let ignoreStored = false;
let inFlight: Promise<string | null> | null = null;

type Outcome = { token: string } | 'taken' | 'failed';

export async function getStoredToken(): Promise<string | null> {
  if (cached) return cached;
  if (ignoreStored) return null;
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored && TOKEN_SHAPE.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    // Unreadable storage is the same as no token.
  }
  return null;
}

export async function clearDeviceToken(rejectedToken?: string): Promise<void> {
  // Compare and invalidate synchronously: a late 401 must not delete a newer
  // credential installed while its request was in flight.
  if (rejectedToken !== undefined && cached !== rejectedToken) return;
  cached = null;
  ignoreStored = true;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing more to do.
  }
}

async function requestToken(deviceId: string): Promise<Outcome> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/devices/register`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
      signal: timeout.signal,
    });
    if (res.status === 409) return 'taken';
    if (res.status !== 201) return 'failed';
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === 'string' && TOKEN_SHAPE.test(body.token) ? { token: body.token } : 'failed';
  } catch {
    return 'failed';
  } finally {
    timeout.clear();
  }
}

/** This device's token, registering first if there is none; null when that is not possible right now. */
export function ensureDeviceToken(): Promise<string | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const stored = await getStoredToken();
    if (stored) return stored;

    let outcome = await requestToken(await getDeviceId());
    // The id already holds a token this install does not have. The server
    // will never hand that one out again, so start over once under a new id.
    if (outcome === 'taken') outcome = await requestToken(await rotateDeviceId());
    if (typeof outcome !== 'object') return null;

    cached = outcome.token;
    try {
      await SecureStore.setItemAsync(KEY, outcome.token);
    } catch {
      // Usable for this session; the next launch will rotate and register again.
    }
    return outcome.token;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
