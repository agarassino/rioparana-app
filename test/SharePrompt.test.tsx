import { renderAsync, screen, fireEventAsync } from '@testing-library/react-native';
import { Share, Linking } from 'react-native';
import { SharePrompt } from '../src/components/SharePrompt';

const mockRequestReview = jest.fn(async () => {});
const mockIsAvailable = jest.fn(async () => true);
jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  requestReview: () => mockRequestReview(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

const show = (over: Record<string, unknown> = {}) =>
  renderAsync(
    <SharePrompt visible onActed={jest.fn()} onDismiss={jest.fn()} {...over} />,
  );

describe('SharePrompt', () => {
  test('asks the reader nothing about their opinion', async () => {
    // Google forbids a question like "do you like the app?" in front of the
    // in-app review sheet, and a prompt that filters for happy users is what
    // that rule exists to stop.
    await show();

    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/te gusta|te sirve|disfrut|¿.*\?/i);
  });

  test('offers both doors and a way out', async () => {
    await show();

    expect(screen.getByText('Compartir la app')).toBeTruthy();
    expect(screen.getByText('Calificar la app')).toBeTruthy();
    expect(screen.getByText('Ahora no')).toBeTruthy();
  });

  test('shares a message carrying the install link', async () => {
    await show();
    await fireEventAsync.press(screen.getByText('Compartir la app'));

    const arg = (Share.share as jest.Mock).mock.calls[0][0];
    expect(arg.message).toContain('play.google.com');
  });

  test('puts the reading on screen into the recommendation', async () => {
    await show({ context: { stationName: 'Rosario', level: 2.54 } });
    await fireEventAsync.press(screen.getByText('Compartir la app'));

    expect((Share.share as jest.Mock).mock.calls[0][0].message)
      .toContain('Rosario está en 2.54 m');
  });

  test('uses Google own review sheet rather than sending anyone to the listing', async () => {
    await show();
    await fireEventAsync.press(screen.getByText('Calificar la app'));

    expect(mockRequestReview).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  test('falls back to the listing when that sheet is unavailable', async () => {
    // It has a quota and does not always appear.
    mockIsAvailable.mockResolvedValue(false);
    await show();
    await fireEventAsync.press(screen.getByText('Calificar la app'));

    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('play.google.com'));
  });

  test('closes the subject once the reader shared', async () => {
    const onActed = jest.fn();
    await show({ onActed });
    await fireEventAsync.press(screen.getByText('Compartir la app'));

    expect(onActed).toHaveBeenCalled();
  });

  test('closes it even when the share sheet threw', async () => {
    // Left open on a failure, the modal traps the reader on a screen they
    // cannot get past.
    (Share.share as jest.Mock).mockRejectedValue(new Error('no'));
    const onActed = jest.fn();
    await show({ onActed });
    await fireEventAsync.press(screen.getByText('Compartir la app'));

    expect(onActed).toHaveBeenCalled();
  });

  test('"Ahora no" dismisses without counting as acted', async () => {
    const onActed = jest.fn();
    const onDismiss = jest.fn();
    await show({ onActed, onDismiss });

    await fireEventAsync.press(screen.getByText('Ahora no'));

    expect(onDismiss).toHaveBeenCalled();
    expect(onActed).not.toHaveBeenCalled();
  });
});
