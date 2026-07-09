import { useQuery } from '@tanstack/react-query';
import { getNews } from '../services/api/newsApi';

export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: getNews,
    staleTime: 1000 * 60 * 30, // 30 minutos
  });
}
