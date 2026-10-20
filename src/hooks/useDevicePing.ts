// src/hooks/useDevicePing.ts
import { useEffect } from 'react';

import { pingDevice } from '../services/api/backend';

/**
 * Reports that this device opened a screen, and which station it was looking
 * at. Fire and forget: it never blocks rendering and never surfaces an error.
 */
export function useDevicePing(stationId?: string): void {
  useEffect(() => {
    void pingDevice(stationId);
  }, [stationId]);
}
