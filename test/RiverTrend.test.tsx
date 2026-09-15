import { render, screen, fireEvent } from '@testing-library/react-native';
import { RiverTrend } from '../src/components/RiverTrend';

// The history hook is the one thing stubbed here: the component's job is to
// turn readings into a card, and owning the network would test React Query
// instead. Everything below the hook is the real component.
const mockHistory = jest.fn();
jest.mock('../src/hooks', () => ({
  useRiverHistory: () => mockHistory(),
}));

const NOW = new Date('2026-09-15T12:00:00Z');
const hoursAgo = (h: number, level: number) => ({
  timestamp: new Date(NOW.getTime() - h * 3600_000).toISOString(),
  level,
});

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  mockHistory.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

const withHistory = (rows: unknown[]) => {
  mockHistory.mockReturnValue({ data: rows });
  return render(<RiverTrend stationId="rosario" />);
};

/** The card measures itself before drawing; nothing fires layout in a test. */
function giveItAWidth(width = 320) {
  const host = screen.UNSAFE_root.findAll(
    (n) => typeof n.type === 'string' && typeof n.props.onLayout === 'function',
  )[0];
  fireEvent(host, 'layout', { nativeEvent: { layout: { width, height: 120 } } });
}

describe('RiverTrend', () => {
  test('renders nothing at all while the API has no history', () => {
    // This is the state on a station's first day. An empty card with a heading
    // in it is worse than no card.
    withHistory([]);

    expect(screen.toJSON()).toBeNull();
  });

  test('renders nothing on a single reading', () => {
    // One point is not a trend.
    withHistory([hoursAgo(2, 3)]);

    expect(screen.toJSON()).toBeNull();
  });

  test('appears once there are two readings to join', () => {
    withHistory([hoursAgo(26, 3), hoursAgo(2, 3.1)]);

    expect(screen.getByText('Cómo viene el río')).toBeTruthy();
  });

  test('leads with what the river did since yesterday', () => {
    withHistory([hoursAgo(26, 3), hoursAgo(2, 3.1)]);

    expect(screen.getByText('Subió 10 cm')).toBeTruthy();
    expect(screen.getByText('en las últimas 24 h')).toBeTruthy();
  });

  test('points down when the river dropped', () => {
    withHistory([hoursAgo(26, 3.3), hoursAgo(2, 3.18)]);

    expect(screen.getByText('Bajó 12 cm')).toBeTruthy();
  });

  test('summarises the week under the badge', () => {
    withHistory([hoursAgo(72, 3), hoursAgo(26, 3.05), hoursAgo(2, 3.12)]);

    expect(screen.getByText('Subió 12 cm en 3 días')).toBeTruthy();
  });

  test('labels the scale with both extremes and the count', () => {
    withHistory([hoursAgo(26, 2.95), hoursAgo(2, 3.28)]);

    expect(screen.getByText(/Mínima 2\.95 m · máxima 3\.28 m · 2 mediciones/)).toBeTruthy();
  });

  test('still draws the week when the day cannot be answered', () => {
    // Readings four and five days old: the curve is honest, "since yesterday"
    // is not. The badge goes, the card stays.
    withHistory([hoursAgo(120, 2.9), hoursAgo(96, 3.1)]);

    expect(screen.getByText('Cómo viene el río')).toBeTruthy();
    expect(screen.queryByText(/últimas \d+ h/)).toBeNull();
  });

  test('draws no curve until it knows how wide it is', () => {
    // The first pass has no measured width. The card is already useful without
    // the curve, so the badge and the sentence must not wait for it.
    withHistory([hoursAgo(26, 3), hoursAgo(2, 3.1)]);

    expect(screen.UNSAFE_queryByType('RNSVGSvgView' as never)).toBeNull();
    expect(screen.getByText('Subió 10 cm')).toBeTruthy();
  });

  test('draws the curve once it has been measured', () => {
    withHistory([hoursAgo(26, 3), hoursAgo(2, 3.1)]);
    giveItAWidth(320);

    const svg = screen.UNSAFE_root.findAll(
      (n) => typeof n.type === 'string' && n.type.startsWith('RNSVG'),
    );
    expect(svg.length).toBeGreaterThan(0);
  });

  test('ignores readings older than the window it claims to show', () => {
    // A reading from three weeks ago must not stretch the axis, or the week
    // the card is titled after gets squashed into the right-hand edge.
    withHistory([hoursAgo(24 * 20, 1), hoursAgo(26, 3), hoursAgo(2, 3.1)]);

    expect(screen.getByText(/Mínima 3\.00 m · máxima 3\.10 m · 2 mediciones/)).toBeTruthy();
  });
});
