import { render, screen, fireEvent } from '@testing-library/react-native';
import NotificationsScreen from '../app/notificaciones';

const mockHistory = jest.fn();
jest.mock('../src/hooks', () => ({
  useNotificationHistory: () => mockHistory(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));

const NOW = new Date('2026-09-15T15:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const row = (over: Record<string, unknown> = {}) => ({
  id: '1',
  stationId: 'rosario',
  title: 'Rosario · 2.54 m',
  body: 'Subió 6 cm desde ayer. A 2.46 m del nivel de alerta.',
  sentAt: hoursAgo(5),
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  mockHistory.mockReset();
  mockPush.mockReset();
  mockHistory.mockReturnValue({ data: [], isLoading: false, refetch: jest.fn(), isRefetching: false });
});

afterEach(() => jest.useRealTimers());

const withRows = (rows: unknown[]) => {
  mockHistory.mockReturnValue({
    data: rows, isLoading: false, refetch: jest.fn(), isRefetching: false,
  });
  return render(<NotificationsScreen />);
};

describe('NotificationsScreen', () => {
  test('shows the title and body of what was sent', () => {
    withRows([row()]);

    expect(screen.getByText('Rosario · 2.54 m')).toBeTruthy();
    expect(screen.getByText(/Subió 6 cm desde ayer/)).toBeTruthy();
  });

  test('says when it arrived in words for the recent ones', () => {
    withRows([row({ sentAt: hoursAgo(5) })]);

    expect(screen.getByText(/^Hoy \d{2}:\d{2}$/)).toBeTruthy();
  });

  test('marks yesterday as yesterday', () => {
    withRows([row({ sentAt: hoursAgo(28) })]);

    expect(screen.getByText(/^Ayer \d{2}:\d{2}$/)).toBeTruthy();
  });

  test('dates the older ones properly', () => {
    withRows([row({ sentAt: hoursAgo(24 * 5) })]);

    expect(screen.getByText(/de septiembre/)).toBeTruthy();
  });

  test('opens the station the notification was about', () => {
    // The point of keeping the list: going from what was said to the river it
    // was said about.
    withRows([row({ stationId: 'goya' })]);

    fireEvent.press(screen.getByText('Rosario · 2.54 m'));

    expect(mockPush).toHaveBeenCalledWith('/river/goya');
  });

  test('explains the empty list rather than showing a blank screen', () => {
    // For a new install this is the normal state, not a failure.
    withRows([]);

    expect(screen.getByText('Todavía no hay notificaciones')).toBeTruthy();
    expect(screen.getByText(/cada mañana/i)).toBeTruthy();
  });

  test('shows a spinner while the first load is in flight', () => {
    mockHistory.mockReturnValue({
      data: undefined, isLoading: true, refetch: jest.fn(), isRefetching: false,
    });
    render(<NotificationsScreen />);

    expect(screen.queryByText('Todavía no hay notificaciones')).toBeNull();
  });

  test('lists the newest first, as the server returns them', () => {
    withRows([row({ id: '1', title: 'Nueva' }), row({ id: '2', title: 'Vieja' })]);

    const titles = screen.getAllByText(/Nueva|Vieja/).map((n) => n.props.children);
    expect(titles).toEqual(['Nueva', 'Vieja']);
  });
});
