import { useQuery } from '@tanstack/react-query';
import { getBackendHistory } from '../services/api/backend';

// Prefectura publishes about twice a day, so the history is worth far less
// frequent refetching than the current level.
export function useRiverHistory(stationId: string) {
  return useQuery({
    queryKey: ['riverHistory', stationId],
    queryFn: () => getBackendHistory(stationId),
    staleTime: 1000 * 60 * 60,
    enabled: !!stationId,
  });
}
