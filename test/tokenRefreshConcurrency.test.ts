import { afterEach, expect, test, vi } from 'vitest';
const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
 getItemAsync: async (key: string) => store.get(key) ?? null,
 setItemAsync: async (key: string, value: string) => { store.set(key, value); },
 deleteItemAsync: async (key: string) => { store.delete(key); },
}));
afterEach(() => { vi.unstubAllGlobals(); store.clear(); });
test('late rejected old request cannot invalidate the fresh token or rotate identity', async () => {
 vi.resetModules();
 const old = 'a'.repeat(43), fresh = 'b'.repeat(43);
 const device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 store.set('parana-info.device-token', old); store.set('parana-info.device-id', device);
 let late!: (res: Response) => void;
 const delayed = new Promise<Response>((resolve) => { late = resolve; });
 let oldCalls = 0, registrations = 0;
 const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  if (url.endsWith('/devices/register')) {
   registrations++;
   return new Response(JSON.stringify(registrations === 1 ? { token: fresh } : { error: 'already_registered' }), { status: registrations === 1 ? 201 : 409 });
  }
  const token = (init.headers as Record<string,string>).Authorization;
  if (token === `Bearer ${old}`) {
   oldCalls++;
   return oldCalls === 1 ? new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 }) : delayed;
  }
  return new Response('[]', { status: 200 });
 });
 vi.stubGlobal('fetch', fetchMock);
 const { authedFetch } = await import('../src/services/api/authedFetch');
 const a = authedFetch('/feedback'); const b = authedFetch('/me/notifications');
 expect((await a)?.status).toBe(200);
 late(new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 }));
 expect((await b)?.status).toBe(200);
 expect(registrations).toBe(1);
 expect(store.get('parana-info.device-token')).toBe(fresh);
 expect(store.get('parana-info.device-id')).toBe(device);
});
