// test/DeviceRegistration.test.tsx
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

const mockEnsure = jest.fn();
jest.mock('../src/services/deviceToken', () => ({ ensureDeviceToken: () => mockEnsure() }));

import { useDeviceRegistration } from '../src/hooks/useDeviceRegistration';

function Probe() {
  useDeviceRegistration();
  return <Text>pantalla</Text>;
}

let onChange: ((state: string) => void) | undefined;

beforeEach(() => {
  mockEnsure.mockReset();
  onChange = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (s: string) => void) => {
    onChange = listener;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

test('starts registration on mount without waiting for it', () => {
  mockEnsure.mockReturnValue(new Promise(() => {}));
  render(<Probe />);

  expect(screen.getByText('pantalla')).toBeTruthy();
  expect(mockEnsure).toHaveBeenCalledTimes(1);
});

test('tries again when the app comes back to the foreground', () => {
  mockEnsure.mockResolvedValue(null);
  render(<Probe />);

  act(() => onChange?.('active'));
  act(() => onChange?.('background'));

  expect(mockEnsure).toHaveBeenCalledTimes(2);
});

test('swallows a rejected registration', async () => {
  mockEnsure.mockRejectedValue(new Error('unexpected'));
  render(<Probe />);
  await act(async () => {});
  expect(screen.getByText('pantalla')).toBeTruthy();
});
