import { describe, expect, test } from 'vitest';
import {
  COOLDOWN_DAYS, MAX_ASKS, VIEWS_BEFORE_ASKING, nextPromptState, shouldPrompt,
} from '../src/services/reviewPrompt';

const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();

const state = (over: Record<string, unknown> = {}) => ({
  views: VIEWS_BEFORE_ASKING,
  asks: 0,
  lastAskedAt: null,
  done: false,
  ...over,
});

describe('shouldPrompt', () => {
  test('waits until the app has been useful a few times', () => {
    // Asking before the reader has got anything out of it is how an app
    // collects one-star reviews.
    expect(shouldPrompt(state({ views: VIEWS_BEFORE_ASKING - 1 }), NOW)).toBe(false);
    expect(shouldPrompt(state({ views: VIEWS_BEFORE_ASKING }), NOW)).toBe(true);
  });

  test('never asks again once the reader acted on it', () => {
    // Shared or rated: the ask has been answered, for good.
    expect(shouldPrompt(state({ done: true, views: 99 }), NOW)).toBe(false);
  });

  test('leaves a long gap after a "not now"', () => {
    expect(shouldPrompt(state({ asks: 1, lastAskedAt: daysAgo(COOLDOWN_DAYS - 1) }), NOW))
      .toBe(false);
    expect(shouldPrompt(state({ asks: 1, lastAskedAt: daysAgo(COOLDOWN_DAYS) }), NOW))
      .toBe(true);
  });

  test('gives up after a couple of refusals', () => {
    // Someone who said no twice has told us the answer. Asking a third time
    // is what gets an app uninstalled rather than rated.
    const worn = state({ asks: MAX_ASKS, lastAskedAt: daysAgo(365), views: 99 });

    expect(shouldPrompt(worn, NOW)).toBe(false);
  });

  test('survives a stored date it cannot read', () => {
    // Storage can come back with anything. Treating it as "asked just now" is
    // the quiet failure; treating it as never asked would prompt on every
    // launch.
    expect(shouldPrompt(state({ asks: 1, lastAskedAt: 'no es una fecha' }), NOW)).toBe(false);
  });

  test('asks nothing of a reader with no state at all', () => {
    expect(shouldPrompt(null, NOW)).toBe(false);
  });
});

describe('nextPromptState', () => {
  test('counts a view', () => {
    expect(nextPromptState(state({ views: 2 }), 'viewed', NOW).views).toBe(3);
  });

  test('closes the subject once the reader shared or rated', () => {
    expect(nextPromptState(state(), 'acted', NOW).done).toBe(true);
  });

  test('records a refusal with its date, so the gap can be measured', () => {
    const next = nextPromptState(state(), 'dismissed', NOW);

    expect(next.asks).toBe(1);
    expect(next.lastAskedAt).toBe(NOW.toISOString());
    expect(next.done).toBe(false);
  });

  test('starts from nothing when there is no state yet', () => {
    expect(nextPromptState(null, 'viewed', NOW)).toEqual({
      views: 1, asks: 0, lastAskedAt: null, done: false,
    });
  });

  test('a view never resurrects a closed prompt', () => {
    expect(nextPromptState(state({ done: true }), 'viewed', NOW).done).toBe(true);
  });
});
