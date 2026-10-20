// src/services/api/http.ts
// Shared by every client of our backend. Release builds use the production
// API by default, while EXPO_PUBLIC_* variables allow environment overrides.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.rioparana.com.ar';
export const API_KEY = process.env.EXPO_PUBLIC_APP_API_KEY || '';

export const REQUEST_TIMEOUT_MS = 5000;

export function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}
