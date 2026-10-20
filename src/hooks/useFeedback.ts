// src/hooks/useFeedback.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addMessage, createThread, getThread, listThreads, type NewThreadInput } from '../services/api/feedbackApi';
import { deviceInfo } from '../services/deviceInfo';
import type { FeedbackFailure } from '../services/api/feedbackApi';

class FeedbackListError extends Error {
  constructor(readonly reason: FeedbackFailure) { super(reason); this.name = 'FeedbackListError'; }
}

export const FEEDBACK_KEY = ['feedback'] as const;

export function useFeedbackThreads() {
  return useQuery({
    queryKey: [...FEEDBACK_KEY, 'list'],
    queryFn: async () => {
      const result = await listThreads();
      if (!result.ok) throw new FeedbackListError(result.reason);
      return result.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Opening a thread clears its unread flag on the server, so the list is refreshed after. */
export function useFeedbackThread(threadId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...FEEDBACK_KEY, 'thread', threadId],
    enabled: threadId.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const result = await getThread(threadId);
      if (result.ok) void queryClient.invalidateQueries({ queryKey: [...FEEDBACK_KEY, 'list'] });
      return result;
    },
  });
}

export function useSendFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewThreadInput) => createThread(input, deviceInfo()),
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
    },
  });
}

export function useReplyToThread(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addMessage(threadId, body),
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
    },
  });
}
