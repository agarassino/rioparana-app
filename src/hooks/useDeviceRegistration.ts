// src/hooks/useDeviceRegistration.ts
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ensureDeviceToken } from '../services/deviceToken';

// Gets the device token early so the first authenticated call does not pay
// for it, and retries when the reader comes back after being offline. Every
// authenticated call also registers lazily, so nothing waits on this.
export function useDeviceRegistration(): void {
  useEffect(() => {
    const attempt = () => {
      ensureDeviceToken().catch(() => undefined);
    };
    attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => sub.remove();
  }, []);
}
