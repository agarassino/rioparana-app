import { useQuery } from '@tanstack/react-query';
import { getDeviceId } from '../services/deviceId';
import { getNotificationHistory } from '../services/api/backend';

export function useNotificationHistory() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const deviceId = await getDeviceId();
      return deviceId ? getNotificationHistory(deviceId) : [];
    },
    staleTime: 1000 * 60 * 5,
  });
}
