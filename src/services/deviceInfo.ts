// src/services/deviceInfo.ts
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { DeviceInfo } from './api/feedbackApi';
import { osVersionLabel } from './feedbackText';

// What the owner needs to reproduce a reported error, and nothing more.
export function deviceInfo(): DeviceInfo {
  return {
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    osVersion: osVersionLabel(Platform.OS, Platform.Version),
  };
}
