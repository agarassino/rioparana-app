// test/ThreadScreen.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ThreadScreen from '../app/contacto/[threadId]';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mockThread = jest.fn();
const mockReply = jest.fn();
const mockRefetch = jest.fn();
jest.mock('../src/hooks', () => ({
  useFeedbackThread: () => mockThread(),
  useReplyToThread: () => ({ mutateAsync: mockReply, isPending: false }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
}));

const detail = {
  id: ID, kind: 'bug', stationId: 'rosario', status: 'answered', unread: false, preview: 'El dato es viejo',
  createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T13:00:00.000Z',
  messages: [
    { id: 'm1', author: 'device', body: 'El dato es viejo', createdAt: '2026-10-13T12:00:00.000Z' },
    { id: 'm2', author: 'admin', body: 'Gracias, ya lo corregimos', createdAt: '2026-10-13T13:00:00.000Z' },
  ],
};
const loaded = (data: unknown) => mockThread.mockReturnValue({ data, isLoading: false, refetch: mockRefetch });
const type = (t: string) => fireEvent.changeText(screen.getByTestId('thread-reply-input'), t);
const send = () => fireEvent.press(screen.getByTestId('thread-reply-send'));

beforeEach(() => {
  jest.clearAllMocks();
  loaded({ ok: true, data: detail });
  mockReply.mockResolvedValue({ ok: true, data: { id: 'm3' } });
});

describe('ThreadScreen', () => {
  test('shows the conversation in order, signed', () => {
    render(<ThreadScreen />);

    const bodies = screen.getAllByText(/El dato es viejo|Gracias, ya lo corregimos/).map((n) => n.props.children);
    expect(bodies).toEqual(['El dato es viejo', 'Gracias, ya lo corregimos']);
    expect(screen.getByText('Paraná Info')).toBeTruthy();
    expect(screen.getByText('Vos')).toBeTruthy();
  });

  test('sends a reply and clears the box', async () => {
    render(<ThreadScreen />);

    type('  Gracias!  ');
    send();

    await waitFor(() => expect(mockReply).toHaveBeenCalledWith('Gracias!'));
    await waitFor(() => expect(screen.getByTestId('thread-reply-input').props.value).toBe(''));
  });

  test('keeps a failed reply in the box', async () => {
    mockReply.mockResolvedValue({ ok: false, reason: 'offline' });
    render(<ThreadScreen />);

    type('Sigue igual');
    send();

    expect(await screen.findByText('No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.')).toBeTruthy();
    expect(screen.getByTestId('thread-reply-input').props.value).toBe('Sigue igual');
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  test('replies once on a double tap', () => {
    mockReply.mockReturnValue(new Promise(() => {}));
    render(<ThreadScreen />);
    type('Hola');
    send();
    send();
    expect(mockReply).toHaveBeenCalledTimes(1);
  });

  test('says so when the thread is gone', () => {
    loaded({ ok: false, reason: 'not_found' });
    render(<ThreadScreen />);
    expect(screen.getByText('Esta conversación ya no está disponible.')).toBeTruthy();
    expect(screen.queryByTestId('thread-reply-input')).toBeNull();
  });

  test('offers to try again when the thread could not load', () => {
    loaded({ ok: false, reason: 'offline' });
    render(<ThreadScreen />);

    fireEvent.press(screen.getByText('Reintentar'));

    expect(mockRefetch).toHaveBeenCalled();
  });
});
