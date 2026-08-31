import { useEffect } from 'react';

import { getDeviceId } from '../services/deviceId';
import { pingDevice } from '../services/api/backend';

/**
 * Reports that this device opened a screen, and which station it was looking
 * at. Fire and forget: it never blocks rendering and never surfaces an error.
 */
export function useDevicePing(stationId?: string): void {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const deviceId = await getDeviceId();
      if (!cancelled) await pingDevice(deviceId, stationId);
    })();

    return () => {
      cancelled = true;
    };
  }, [stationId]);
}
