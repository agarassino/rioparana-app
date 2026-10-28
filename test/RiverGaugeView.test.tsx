import { render, screen } from '@testing-library/react-native';
import { RiverGauge } from '../src/components/RiverGauge';
import { COLORS } from '../src/config/theme';
import type { WaterLevel } from '../src/types';

// The first test in this repo that actually draws a component. Everything else
// checks the maths; this checks that the maths reaches the screen. A gauge that
// computes a perfect 42% fill and renders an empty view is invisible to every
// other test we have.

const at = (level: number, over: Partial<WaterLevel> = {}): WaterLevel => ({
  stationId: 'rosario',
  timestamp: new Date('2026-09-15T12:00:00Z'),
  level,
  trend: 'stable',
  changeRate: 0,
  alertLevel: 5,
  evacuationLevel: 5.3,
  ...over,
});

/** The style object of the filled part of the track. */
function fillStyle(): Record<string, unknown> {
  const fill = screen.UNSAFE_root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      Array.isArray(n.props.style) &&
      n.props.style.some((s: Record<string, unknown>) => typeof s?.width === 'string'),
  );
  const flat = fill[0].props.style.reduce(
    (acc: Record<string, unknown>, s: Record<string, unknown>) => ({ ...acc, ...s }),
    {},
  );
  return flat;
}

describe('RiverGauge', () => {
  test('draws both reference heights where a reader can see them', () => {
    render(<RiverGauge level={at(2.42)} />);

    expect(screen.getByText('Alerta 5.00')).toBeTruthy();
    expect(screen.getByText('Evac. 5.30')).toBeTruthy();
  });

  test('fills the track in proportion to the level', () => {
    render(<RiverGauge level={at(2.42)} />);

    // Computed rather than pinned to a long float: the point is the ratio, and
    // a fifteen-digit literal breaks on rounding without telling you why.
    const expected = (2.42 / (5.3 * 1.08)) * 100;
    expect(Number.parseFloat(String(fillStyle().width))).toBeCloseTo(expected, 6);
  });

  test('renders nothing at all without a reference height', () => {
    // A bar from zero to nowhere says less than the number above it, so the
    // component removes itself rather than drawing an empty track.
    render(<RiverGauge level={{ ...at(2.42), alertLevel: undefined }} />);

    expect(screen.queryByText(/Alerta/)).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  test('stays in the calm colour while the river is well below alert', () => {
    render(<RiverGauge level={at(2.42)} />);

    expect(fillStyle().backgroundColor).toBe(COLORS.river);
  });

  test('turns red within a metre of the alert height', () => {
    // The same margin getAlertInfo already uses, so the bar and the alert pill
    // beside it cannot contradict each other on the same screen.
    render(<RiverGauge level={at(4.2)} />);

    expect(fillStyle().backgroundColor).toBe(COLORS.emergency);
  });

  test('stays red once the river is over the alert', () => {
    render(<RiverGauge level={at(5.1)} />);

    expect(fillStyle().backgroundColor).toBe(COLORS.emergency);
  });

  test('says in words when the river is under the hydrometric zero', () => {
    // The track is empty at 0.00 m and stays empty below it, so the only way to
    // tell -0.40 m from 0.00 m is to write it.
    render(<RiverGauge level={at(-0.4)} />);

    expect(screen.getByText(/por debajo del cero/i)).toBeTruthy();
  });

  test('keeps that note away when the river is above zero', () => {
    render(<RiverGauge level={at(2.42)} />);

    expect(screen.queryByText(/por debajo del cero/i)).toBeNull();
  });

  test('omits the evacuation mark when the station publishes none', () => {
    render(<RiverGauge level={{ ...at(3), evacuationLevel: undefined }} />);

    expect(screen.getByText('Alerta 5.00')).toBeTruthy();
    expect(screen.queryByText(/Evac/)).toBeNull();
  });

  test('describes itself for a reader who cannot see the bar', () => {
    render(<RiverGauge level={at(2.42)} />);

    expect(
      screen.getByLabelText('Nivel 2.42 metros. Alerta a 5.00 metros, evacuación a 5.30 metros.'),
    ).toBeTruthy();
  });
});
