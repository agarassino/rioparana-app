import { act, render, screen } from '@testing-library/react-native';
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
const mockLast = jest.fn();
const mockTap = jest.fn();
const mockReceive = jest.fn();
const mockFonts = jest.fn();
const mockRegister = jest.fn();
jest.mock('expo-router', () => ({
 useRouter: () => mockRouter,
 Stack: Object.assign(({ children }: any) => children, { Screen: () => null }),
}));
jest.mock('../src/hooks', () => ({ useDeviceRegistration: () => mockRegister(), usePushRegistration: () => {} }));
jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [mockFonts()] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => { const { Text } = require('react-native'); return <Text>Ready</Text>; } }));
jest.mock('expo-notifications', () => ({
 getLastNotificationResponseAsync: () => mockLast(),
 addNotificationResponseReceivedListener: (fn: any) => mockTap(fn),
 addNotificationReceivedListener: (fn: any) => mockReceive(fn),
}));
import RootLayout from '../app/_layout';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = (data: unknown) => ({ notification: { request: { content: { data } } } });
beforeEach(() => {
 jest.clearAllMocks(); mockFonts.mockReturnValue(true); mockLast.mockResolvedValue(null);
 mockTap.mockReturnValue({ remove: jest.fn() }); mockReceive.mockReturnValue({ remove: jest.fn() });
});
test('cold-start reply opens its thread when the navigation tree is ready', async () => {
 mockLast.mockResolvedValue(response({ type: 'feedback_reply', threadId: ID }));
 render(<RootLayout />); await act(async () => {});
 expect(mockPush).toHaveBeenCalledWith(`/contacto/${ID}`);
 expect(screen.getByText('Ready')).toBeTruthy();
});
test('background tap keeps daily navigation working and malformed reply ignored', async () => {
 const view = render(<RootLayout />); await act(async () => {});
 act(() => mockTap.mock.calls[0][0](response({ screen: 'notifications' })));
 act(() => mockTap.mock.calls[0][0](response({ type: 'feedback_reply', threadId: '../admin' })));
 expect(mockPush).toHaveBeenCalledTimes(1); expect(mockPush).toHaveBeenCalledWith('/notificaciones');
 view.unmount(); expect(mockTap.mock.results[0].value.remove).toHaveBeenCalled();
 expect(mockReceive.mock.results[0].value.remove).toHaveBeenCalled();
});
test('does not consume a cold-start notification while fonts prevent navigator mount', async () => {
 mockFonts.mockReturnValue(false); mockLast.mockResolvedValue(response({ type: 'feedback_reply', threadId: ID }));
 const view = render(<RootLayout />); await act(async () => {});
 expect(mockPush).not.toHaveBeenCalled();
 mockFonts.mockReturnValue(true); view.rerender(<RootLayout />); await act(async () => {});
 expect(mockPush).toHaveBeenCalledWith(`/contacto/${ID}`);
});
