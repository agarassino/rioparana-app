import { useQuery } from '@tanstack/react-query';
import { getWeather } from '../services/api/weatherApi';

export function useWeather(latitude: number, longitude: number) {
  return useQuery({
    queryKey: ['weather', latitude, longitude],
    queryFn: () => getWeather(latitude, longitude),
    staleTime: 1000 * 60 * 15, // 15 minutos
    enabled: latitude !== 0 && longitude !== 0,
  });
}
