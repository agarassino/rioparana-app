// When to ask the reader to share or rate the app.
//
// The whole design is about the moment, not the wording. Asked on launch, the
// prompt lands on someone who came for the river height and has been given
// nothing yet — and that is who leaves one star. Asked after the app has been
// useful a few times, it lands on someone who came back.

/** River views before the subject comes up at all. */
export const VIEWS_BEFORE_ASKING = 3;
/** Refusals after which it is never raised again. */
export const MAX_ASKS = 2;
/** Days between asks, so a "not now" means not now rather than not this hour. */
export const COOLDOWN_DAYS = 30;

export interface PromptState {
  views: number;
  asks: number;
  lastAskedAt: string | null;
  /** Shared or rated: the ask has been answered, for good. */
  done: boolean;
}

export type PromptEvent = 'viewed' | 'acted' | 'dismissed';

const EMPTY: PromptState = { views: 0, asks: 0, lastAskedAt: null, done: false };

export function shouldPrompt(state: PromptState | null, now: Date = new Date()): boolean {
  if (!state || state.done) return false;
  if (state.views < VIEWS_BEFORE_ASKING) return false;
  // Someone who said no twice has told us the answer.
  if (state.asks >= MAX_ASKS) return false;
  if (state.lastAskedAt === null) return true;

  const since = Date.parse(state.lastAskedAt);
  // An unreadable date is treated as "asked just now": the quiet failure is a
  // prompt that never comes back, and the loud one is a prompt on every launch.
  if (!Number.isFinite(since)) return false;

  return now.getTime() - since >= COOLDOWN_DAYS * 86400_000;
}

export function nextPromptState(
  state: PromptState | null,
  event: PromptEvent,
  now: Date = new Date(),
): PromptState {
  const s = state ?? EMPTY;

  switch (event) {
    case 'viewed':
      return { ...s, views: s.views + 1 };
    case 'acted':
      return { ...s, done: true };
    case 'dismissed':
      return { ...s, asks: s.asks + 1, lastAskedAt: now.toISOString() };
  }
}
