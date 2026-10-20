jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
// test/FeedbackEntryPoints.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FeedbackHomeCard } from '../src/components/feedback/FeedbackHomeCard';
import { StationReportLink } from '../src/components/feedback/StationReportLink';
import ProfileScreen from '../app/(tabs)/profile';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => mockPush.mockReset());

test('Inicio invites a message in the spec words', () => {
  render(<FeedbackHomeCard />);

  fireEvent.press(screen.getByText('¿Una idea o un error? Escribinos: leemos todo y te respondemos acá en la app.'));

  expect(mockPush).toHaveBeenCalledWith('/contacto');
});

test('a station screen reports an error about that station', () => {
  render(<StationReportLink stationId="rosario" />);

  fireEvent.press(screen.getByText('¿Ves algo mal en este dato? Avisanos →'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/contacto', params: { kind: 'bug', stationId: 'rosario' } });
});

test('Perfil has a row for contact and suggestions', () => {
  render(<ProfileScreen />);

  fireEvent.press(screen.getByText('Contacto y sugerencias'));

  expect(mockPush).toHaveBeenCalledWith('/contacto');
});
