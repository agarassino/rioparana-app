import { useQuery } from '@tanstack/react-query';
import { getCurrentWaterLevel } from '../services/api/riverApi';

export function useWaterLevel(stationId: string) {
  return useQuery({
    queryKey: ['waterLevel', stationId],
    queryFn: () => getCurrentWaterLevel(stationId),
    staleTime: 1000 * 60 * 5, // 5 minutos
    refetchInterval: 1000 * 60 * 15, // Refetch cada 15 minutos
    enabled: !!stationId,
  });
}
