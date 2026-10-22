import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Guide from '../app/el-nino-y-el-parana';
import Home from '../app/(tabs)/index';
jest.mock('../src/hooks', () => ({
  useLocation: () => ({ loading: false }), useDevicePing: () => undefined,
  useWaterLevel: () => ({}), useWeather: () => ({}), useNews: () => ({}),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: mockPush }) }));

afterEach(() => { jest.restoreAllMocks(); mockPush.mockReset(); });

test('renders the offline explanation and dated official sources', () => {
  render(<Guide />);
  expect(screen.getByRole('header', { name: 'El Niño y el Paraná' })).toBeTruthy();
  expect(screen.getByText(/Pacífico ecuatorial central y oriental/)).toBeTruthy();
  expect(screen.getByText(/humedad del suelo/)).toBeTruthy();
  expect(screen.getByText(/Revisión editorial: 22 de octubre de 2026/)).toBeTruthy();
});

test('opens the existing stations route for observed heights', () => {
  render(<Guide />);
  fireEvent.press(screen.getByRole('button', { name: 'Consultar alturas actuales' }));
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/stations');
});

test.each([
  ['NOAA: entender El Niño', 'https://www.noaa.gov/understanding-el-nino'],
  ['INA: seguimiento hidrológico', 'https://alerta.ina.gob.ar/a5/diario/reporte_diario'],
])('opens the official source %s externally', async (label, url) => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  render(<Guide />);
  fireEvent.press(screen.getByRole('link', { name: label }));
  await waitFor(() => expect(open).toHaveBeenCalledWith(url));
});

test('explains a failed external link without losing the offline article', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('offline'));
  render(<Guide />);
  fireEvent.press(screen.getByRole('link', { name: 'NOAA: entender El Niño' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo abrir el enlace. Revisá tu conexión e intentá nuevamente.'));
  expect(screen.getByText('Qué es El Niño')).toBeTruthy();
});

test('home offers the guide without replacing existing features', async () => {
  render(<Home />);
  await act(async () => {});
  expect(screen.getByText('Clima')).toBeTruthy();
  expect(screen.getByText('Noticias Prefectura Naval')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Leer guía: El Niño y el Paraná' }));
  expect(mockPush).toHaveBeenCalledWith('/el-nino-y-el-parana');
});
