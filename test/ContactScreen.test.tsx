jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
// test/ContactScreen.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ContactScreen from '../app/contacto/index';

const mockSend = jest.fn();
const mockThreads = jest.fn();
jest.mock('../src/hooks', () => ({
  useSendFeedback: () => ({ mutateAsync: mockSend, isPending: false }),
  useFeedbackThreads: () => mockThreads(),
}));

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockThreads.mockReturnValue({ data: [] });
  mockSend.mockResolvedValue({ ok: true, data: { id: ID } });
});

const type = (text: string) => fireEvent.changeText(screen.getByTestId('feedback-input'), text);
const send = () => fireEvent.press(screen.getByTestId('feedback-send'));

describe('ContactScreen', () => {
  test('offers the three kinds, Sugerencia first, and the privacy line', () => {
    render(<ContactScreen />);

    expect(screen.getByRole('radio', { name: 'Sugerencia', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Error', checked: false })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Consulta', checked: false })).toBeTruthy();
    expect(screen.getByText('Te respondemos acá. No hace falta mail ni datos personales.')).toBeTruthy();
  });

  test('arrives from a station with Error chosen and the station attached', () => {
    mockParams = { kind: 'bug', stationId: 'rosario' };
    render(<ContactScreen />);

    expect(screen.getByRole('radio', { name: 'Error', checked: true })).toBeTruthy();
    expect(screen.getByText('Sobre: Rosario')).toBeTruthy();
  });

  test('ignores a station the app does not know', () => {
    mockParams = { kind: 'bug', stationId: 'atlantis' };
    render(<ContactScreen />);
    expect(screen.queryByText(/Sobre:/)).toBeNull();
  });

  test('sends kind, trimmed text and station, then opens the thread', async () => {
    mockParams = { kind: 'bug', stationId: 'rosario' };
    render(<ContactScreen />);

    type('  El dato de Rosario es de ayer  ');
    send();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/contacto/${ID}`));
    expect(mockSend).toHaveBeenCalledWith({ kind: 'bug', body: 'El dato de Rosario es de ayer', stationId: 'rosario' });
  });

  test('drops the station when its chip is removed', async () => {
    mockParams = { kind: 'bug', stationId: 'rosario' };
    render(<ContactScreen />);

    fireEvent.press(screen.getByLabelText('Quitar estación'));
    type('Hola');
    send();

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith({ kind: 'bug', body: 'Hola' }));
    expect(screen.queryByText('Sobre: Rosario')).toBeNull();
  });

  test('does not send an empty message', () => {
    render(<ContactScreen />);
    type('   ');
    send();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('keeps the text and offers a retry when offline', async () => {
    mockSend.mockResolvedValue({ ok: false, reason: 'offline' });
    render(<ContactScreen />);

    type('No carga el río');
    send();

    expect(await screen.findByText('No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.')).toBeTruthy();
    expect(screen.getByTestId('feedback-input').props.value).toBe('No carga el río');
    expect(screen.getByText('Reintentar')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('explains the daily limit', async () => {
    mockSend.mockResolvedValue({ ok: false, reason: 'limit' });
    render(<ContactScreen />);
    type('Uno más');
    send();
    expect(await screen.findByText('Llegaste al límite de mensajes por hoy. Probá de nuevo mañana.')).toBeTruthy();
  });

  test('sends once on a double tap', () => {
    mockSend.mockReturnValue(new Promise(() => {}));
    render(<ContactScreen />);

    type('Hola');
    send();
    send();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('counts emoji as one character', async () => {
    render(<ContactScreen />);

    type('😀'.repeat(2000));
    expect(screen.getByText('2000/2000')).toBeTruthy();
    send();
    expect(mockSend).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('feedback-input').props.value).toBe(''));
  });

  test('will not send past 2000 characters', () => {
    render(<ContactScreen />);
    type('😀'.repeat(2001));
    send();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('lists my threads with status and an unread dot, and opens one', () => {
    mockThreads.mockReturnValue({
      data: [{
        id: ID, kind: 'bug', stationId: 'rosario', status: 'answered', unread: true, preview: 'El dato es viejo',
        createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T13:00:00.000Z',
      }],
    });
    render(<ContactScreen />);

    expect(screen.getByText('Mis mensajes')).toBeTruthy();
    expect(screen.getByText('Respondido')).toBeTruthy();
    expect(screen.getByLabelText('Respuesta sin leer')).toBeTruthy();

    fireEvent.press(screen.getByText('El dato es viejo'));
    expect(mockPush).toHaveBeenCalledWith(`/contacto/${ID}`);
  });

  test('hides "Mis mensajes" when there are none', () => {
    render(<ContactScreen />);
    expect(screen.queryByText('Mis mensajes')).toBeNull();
  });
});

test('inbox load failure keeps cached messages visible and retries the list', () => {
 const retry = jest.fn();
 mockThreads.mockReturnValue({ data: [{ id: ID, kind: 'bug', status: 'answered', unread: true, preview: 'Cached thread' }], error: { reason: 'offline' }, refetch: retry });
 render(<ContactScreen />);
 expect(screen.getByText('Cached thread')).toBeTruthy();
 expect(screen.getByText('No pudimos cargar tus mensajes. Revisá tu conexión y probá de nuevo.')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Reintentar cargar mensajes'));
 expect(retry).toHaveBeenCalledTimes(1);
});
test('shows server unavailability separately from an empty inbox', () => {
 mockThreads.mockReturnValue({ error: { reason: 'unavailable' }, refetch: jest.fn() });
 render(<ContactScreen />);
 expect(screen.getByText('El servicio no está disponible ahora. Probá de nuevo en un rato.')).toBeTruthy();
});
test('shows inbox loading rather than claiming there are no messages', () => {
 mockThreads.mockReturnValue({ isLoading: true });
 render(<ContactScreen />);
 expect(screen.getByText('Cargando mensajes…')).toBeTruthy();
});
