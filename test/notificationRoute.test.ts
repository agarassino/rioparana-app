// test/notificationRoute.test.ts
import { describe, expect, test } from 'vitest';
import { routeForNotification } from '../src/services/notificationRoute';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('routeForNotification', () => {
  test('opens the thread a reply belongs to', () => {
    expect(routeForNotification({ type: 'feedback_reply', threadId: ID })).toBe(`/contacto/${ID}`);
  });

  test('keeps sending the daily notification to the list', () => {
    expect(routeForNotification({ screen: 'notifications' })).toBe('/notificaciones');
  });

  test.each([
    ['no data', undefined],
    ['null', null],
    ['an unknown type', { type: 'promo', threadId: ID }],
    ['a path instead of an id', { type: 'feedback_reply', threadId: '../../(tabs)' }],
    ['a number id', { type: 'feedback_reply', threadId: 7 }],
  ])('ignores %s', (_label, data) => {
    expect(routeForNotification(data)).toBeNull();
  });
});
