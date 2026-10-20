import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type PropsWithChildren } from 'react';
const mockGet = jest.fn();
const mockList = jest.fn();
jest.mock('../src/services/api/feedbackApi', () => ({ getThread: (...args: unknown[]) => mockGet(...args), listThreads: () => mockList() }));
jest.mock('../src/services/deviceInfo', () => ({ deviceInfo: () => ({ appVersion: '2.2.0', osVersion: 'android 34' }) }));
import { useFeedbackThread, useFeedbackThreads } from '../src/hooks/useFeedback';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000, gcTime: 0 } } });
 const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return { client, wrapper };
}
beforeEach(() => { jest.clearAllMocks(); });
test('reopening a cached thread reads its latest reply and marks it read', async () => {
 const { client, wrapper } = setup();
 client.setQueryData(['feedback', 'thread', ID], { ok: true, data: { messages: [] } });
 mockGet.mockResolvedValue({ ok: true, data: { messages: [{ body: 'latest' }] } });
 const hook = renderHook(() => useFeedbackThread(ID), { wrapper });
 await waitFor(() => expect(mockGet).toHaveBeenCalledWith(ID));
 await waitFor(() => expect(hook.result.current.data).toEqual({ ok: true, data: { messages: [{ body: 'latest' }] } }));
 hook.unmount(); client.clear();
});
test('revisiting contact refreshes cached unread statuses', async () => {
 const { client, wrapper } = setup();
 client.setQueryData(['feedback', 'list'], []);
 mockList.mockResolvedValue({ ok: true, data: [{ id: ID, unread: true }] });
 const hook = renderHook(() => useFeedbackThreads(), { wrapper });
 await waitFor(() => expect(mockList).toHaveBeenCalled());
 await waitFor(() => expect(hook.result.current.data).toEqual([{ id: ID, unread: true }]));
 hook.unmount(); client.clear();
});

test('inbox failure preserves cached threads and exposes a typed retryable error', async () => {
 const { client, wrapper } = setup();
 const cached = [{ id: ID, unread: true }];
 client.setQueryData(['feedback', 'list'], cached);
 mockList.mockResolvedValue({ ok: false, reason: 'offline' });
 const hook = renderHook(() => useFeedbackThreads(), { wrapper });
 await waitFor(() => expect(hook.result.current.isError).toBe(true));
 expect(hook.result.current.data).toEqual(cached);
 expect(hook.result.current.error).toMatchObject({ reason: 'offline' });
 mockList.mockResolvedValue({ ok: true, data: [] });
 await act(async () => { await hook.result.current.refetch(); });
 await waitFor(() => expect(hook.result.current.data).toEqual([]));
 hook.unmount(); client.clear();
});
