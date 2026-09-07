export const DISMISS_KEY: string;
export const SHOW_RATIO: number;
export const MAX_SCROLL_PX: number;

/** Anything shaped like localStorage; null and throwing stores are handled. */
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScrollState {
  scrollY: number;
  viewportH: number;
  docH: number;
}

export function isDismissed(storage: Storage | null): boolean;
export function rememberDismissal(storage: Storage | null): void;
export function shouldReveal(state: ScrollState, ratio?: number): boolean;
