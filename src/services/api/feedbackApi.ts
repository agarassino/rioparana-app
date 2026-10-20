// src/services/api/feedbackApi.ts
import { authedFetch } from './authedFetch';

// The in-app feedback API. Every call resolves to a result rather than
// throwing, so a screen can keep what the reader typed and say why it failed.

export type FeedbackKind = 'suggestion' | 'bug' | 'question';
export type ThreadStatus = 'open' | 'answered' | 'archived';

export interface FeedbackMessage {
  id: string;
  author: 'device' | 'admin';
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

export type FeedbackFailure = 'offline' | 'limit' | 'invalid' | 'not_found' | 'unavailable';
export type FeedbackResult<T> = { ok: true; data: T } | { ok: false; reason: FeedbackFailure };

export interface NewThreadInput {
  kind: FeedbackKind;
  body: string;
  stationId?: string;
}

export interface DeviceInfo {
  appVersion: string;
  osVersion: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['suggestion', 'bug', 'question'];
const STATUSES = ['open', 'answered', 'archived'];

const isString = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown) => isString(v) && Number.isFinite(Date.parse(v));

function isMessage(v: unknown): v is FeedbackMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return isString(m.id) && (m.author === 'device' || m.author === 'admin') && isString(m.body) && isDate(m.createdAt);
}

function isSummary(v: unknown): v is ThreadSummary {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    isString(t.id) && KINDS.includes(t.kind as string) && (t.stationId === null || isString(t.stationId)) &&
    STATUSES.includes(t.status as string) && typeof t.unread === 'boolean' && isString(t.preview) &&
    isDate(t.createdAt) && isDate(t.updatedAt)
  );
}

function isDetail(v: unknown): v is ThreadDetail {
  return isSummary(v) && Array.isArray((v as ThreadDetail).messages) && (v as ThreadDetail).messages.every(isMessage);
}

function failureFor(status: number): FeedbackFailure {
  if (status === 429) return 'limit';
  if (status === 400) return 'invalid';
  if (status === 404) return 'not_found';
  return 'unavailable';
}

async function read<T>(res: Response | null, accept: (body: unknown) => T | null): Promise<FeedbackResult<T>> {
  if (!res) return { ok: false, reason: 'offline' };
  if (!res.ok) return { ok: false, reason: failureFor(res.status) };
  try {
    const data = accept(await res.json());
    return data === null ? { ok: false, reason: 'unavailable' } : { ok: true, data };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

// Protect the result contract even if credential storage fails unexpectedly.
async function safeFetch(...args: Parameters<typeof authedFetch>): Promise<Response | null> {
  try { return await authedFetch(...args); } catch { return null; }
}

export async function createThread(input: NewThreadInput, info: DeviceInfo): Promise<FeedbackResult<ThreadDetail>> {
  const res = await safeFetch('/feedback', { method: 'POST', body: { ...input, ...info } });
  return read(res, (b) => (isDetail(b) ? b : null));
}

export async function listThreads(): Promise<FeedbackResult<ThreadSummary[]>> {
  const res = await safeFetch('/feedback');
  return read(res, (b) => (Array.isArray(b) ? b.filter(isSummary) : null));
}

export async function getThread(id: string): Promise<FeedbackResult<ThreadDetail>> {
  if (!UUID.test(id)) return { ok: false, reason: 'not_found' };
  const res = await safeFetch(`/feedback/${id}`);
  return read(res, (b) => (isDetail(b) ? b : null));
}

export async function addMessage(threadId: string, body: string): Promise<FeedbackResult<FeedbackMessage>> {
  if (!UUID.test(threadId)) return { ok: false, reason: 'not_found' };
  const res = await safeFetch(`/feedback/${threadId}/messages`, { method: 'POST', body: { body } });
  return read(res, (b) => (isMessage(b) ? b : null));
}
