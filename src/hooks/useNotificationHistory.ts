// src/hooks/useNotificationHistory.ts
import { useQuery } from '@tanstack/react-query';
import { getNotificationHistory } from '../services/api/backend';

export function useNotificationHistory() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotificationHistory(),
    staleTime: 1000 * 60 * 5,
  });
}
