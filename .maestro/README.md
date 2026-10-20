# End-to-end flows

One flow today: open the app, reach a station, read the river. It is the only
check that proves the screens are reachable, that navigation wires up, and that
live data from the API arrives and is drawn. Unit and component tests cannot
see any of that.

## Running

Needs a booted Android emulator and a **release** build installed.

```bash
# once per machine
curl -fsSL "https://get.maestro.mobile.dev" | bash

# boot an emulator
$ANDROID_HOME/emulator/emulator -avd <your-avd> &

# install a standalone build — NOT the dev client (see below)
npx expo run:android --variant release --no-bundler

npm run e2e
```

## Two traps this cost a session to find

**Never run against the dev client.** The Expo dev-client launcher shows the
app's own name on its home screen, so `assertVisible: "Paraná Info"` passes
while the app has not loaded at all. The flow reported success against a screen
that was not ours. Every assertion here now names something only the real
screens contain, and one of them asserts the launcher is *absent*.

**Android's "Device location" prompt appears after first paint**, on every
screen that asks for a position, so dismissing it once at launch does not work.
Each wait is wrapped in a `retry` that runs `dismiss-location.yaml` and looks
again. The prompt is dismissed rather than accepted on purpose: the app has to
work for someone who says no.

## Emulator notes

- `adb shell pm disable-user --user 0 com.google.android.apps.wellbeing` —
  Digital Wellbeing ANRs on some images and its dialog covers the app.
- The station list runs north to south down the river, so Rosario sits well
  below the fold. The flow scrolls to it, which also proves the list is
  complete and scrollable.

## Feedback loop (release-only, owner approval required)

`npm run e2e:feedback` sends a real message, logs into the admin, replies and
archives the thread, then opens its reply push. It may send owner email and
push notifications. It clears the installed app's data.

Requires a 2.2.0+ release build, a booted Android device with Google Play services,
verified backend rollout, and access to the explicitly approved admin origin.
Only after owner approval, set `FEEDBACK_E2E_APPROVED=1`, `ADMIN_URL`, and
`ADMIN_PASSWORD` locally (never commit them), then run the command. No admin
production address is assumed. The password is not printed by the scripts.
A successful run prints its marker; record evidence separately. This workflow
is NOT a substitute for cold-start/offline real-device release checks.
