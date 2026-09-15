// Getting a push token, and the manners around asking for one.
//
// The Expo module is injected rather than imported so this can be tested
// without a device. The decisions here are about permission, not about
// notifications: ask once, respect a refusal, and never throw on app start.

// Expo issues tokens in exactly this shape, and the backend refuses anything
// else. Catching it here keeps a client bug from looking like a server one.
const EXPO_TOKEN = /^ExponentPushToken\[[^\]]+\]$/;

export interface PermissionAnswer {
  status: string;
  canAskAgain: boolean;
}

export interface PushDeps {
  /** Simulators have no push service, so there is nothing to ask for. */
  isDevice: boolean;
  getPermissions: () => Promise<PermissionAnswer>;
  requestPermissions: () => Promise<PermissionAnswer>;
  getToken: () => Promise<{ data: string }>;
}

/** The device's push token, or null whenever there is honestly not one. */
export async function resolvePushToken(deps: PushDeps): Promise<string | null> {
  if (!deps.isDevice) return null;

  try {
    let permission = await deps.getPermissions();

    if (permission.status !== 'granted') {
      // Android stops showing the dialog after two refusals, and the app then
      // looks broken to someone who changes their mind. Asking only while the
      // system still allows it is what keeps the one prompt worth having.
      if (!permission.canAskAgain) return null;
      permission = await deps.requestPermissions();
    }

    if (permission.status !== 'granted') return null;

    const { data } = await deps.getToken();
    return EXPO_TOKEN.test(data) ? data : null;
  } catch {
    // This runs on app start. A rejected promise here would take the screen
    // down over something the reader never asked for.
    return null;
  }
}
