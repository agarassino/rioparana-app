// src/services/notificationRoute.ts
// Where a tapped notification leads. The payload comes from our server, but
// it is still input: only a well-formed thread id becomes part of a route.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function routeForNotification(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { type?: unknown; threadId?: unknown; screen?: unknown };
  if (d.type === 'feedback_reply') {
    return typeof d.threadId === 'string' && UUID.test(d.threadId) ? `/contacto/${d.threadId}` : null;
  }
  if (d.screen === 'notifications') return '/notificaciones';
  return null;
}
