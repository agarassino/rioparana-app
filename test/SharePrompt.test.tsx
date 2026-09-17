import { render, screen, fireEvent } from '@testing-library/react-native';
import { Share, Linking } from 'react-native';
import { SharePrompt } from '../src/components/SharePrompt';

const mockRequestReview = jest.fn(async () => {});
const mockIsAvailable = jest.fn(async () => true);
jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  requestReview: () => mockRequestReview(),
}));

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

const show = (over: Record<string, unknown> = {}) =>
  render(
    <SharePrompt visible onActed={jest.fn()} onDismiss={jest.fn()} {...over} />,
  );

describe('SharePrompt', () => {
  test('asks the reader nothing about their opinion', () => {
    // Google forbids a question like "do you like the app?" in front of the
    // in-app review sheet, and a prompt that filters for happy users is what
    // that rule exists to stop.
    show();

    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toMatch(/te gusta|te sirve|disfrut|¿.*\?/i);
  });

  test('offers both doors and a way out', () => {
    show();

    expect(screen.getByText('Compartir la app')).toBeTruthy();
    expect(screen.getByText('Calificar la app')).toBeTruthy();
    expect(screen.getByText('Ahora no')).toBeTruthy();
  });

  test('shares a message carrying the install link', async () => {
    show();
    fireEvent.press(screen.getByText('Compartir la app'));
    await flush();

    const arg = (Share.share as jest.Mock).mock.calls[0][0];
    expect(arg.message).toContain('play.google.com');
  });

  test('puts the reading on screen into the recommendation', async () => {
    show({ context: { stationName: 'Rosario', level: 2.54 } });
    fireEvent.press(screen.getByText('Compartir la app'));
    await flush();

    expect((Share.share as jest.Mock).mock.calls[0][0].message)
      .toContain('Rosario está en 2.54 m');
  });

  test('uses Google own review sheet rather than sending anyone to the listing', async () => {
    show();
    fireEvent.press(screen.getByText('Calificar la app'));
    await flush();

    expect(mockRequestReview).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  test('falls back to the listing when that sheet is unavailable', async () => {
    // It has a quota and does not always appear.
    mockIsAvailable.mockResolvedValue(false);
    show();
    fireEvent.press(screen.getByText('Calificar la app'));
    await flush();

    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('play.google.com'));
  });

  test('closes the subject once the reader shared', async () => {
    const onActed = jest.fn();
    show({ onActed });
    fireEvent.press(screen.getByText('Compartir la app'));
    await flush();

    expect(onActed).toHaveBeenCalled();
  });

  test('closes it even when the share sheet threw', async () => {
    // Left open on a failure, the modal traps the reader on a screen they
    // cannot get past.
    (Share.share as jest.Mock).mockRejectedValue(new Error('no'));
    const onActed = jest.fn();
    show({ onActed });
    fireEvent.press(screen.getByText('Compartir la app'));
    await flush();

    expect(onActed).toHaveBeenCalled();
  });

  test('"Ahora no" dismisses without counting as acted', () => {
    const onActed = jest.fn();
    const onDismiss = jest.fn();
    show({ onActed, onDismiss });

    fireEvent.press(screen.getByText('Ahora no'));

    expect(onDismiss).toHaveBeenCalled();
    expect(onActed).not.toHaveBeenCalled();
  });
});
