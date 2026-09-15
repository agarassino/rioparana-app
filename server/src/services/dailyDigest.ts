// The daily notification.
//
// One a day, about the station the device actually looks at. What earns a
// notification is the number plus what it did: "2.54 m" alone is something the
// reader has to open the app to act on, and "subió 6 cm" is the part that
// changes whether they go out on the water.

// The pusher runs from a single laptop. If it stopped, the newest reading is
// yesterday's, and sending it under a notification the reader will take as
// today's is worse than sending nothing.
const MAX_READING_AGE_H = 24;

// The margin at which the alert stops being background and becomes the message.
// Same metre the app and the site already use.
const NEAR_ALERT_M = 1;

export interface DigestReading {
  level: number;
  timestamp: string;
  alertLevel?: number;
  evacuationLevel?: number;
}

export interface DigestChange {
  /** Centimetres, signed. */
  cm: number;
  hours: number;
}

export interface DigestMessage {
  title: string;
  body: string;
  /** Tapping the notification opens the list of them. */
  data: { screen: 'notifications' };
}

const m = (n: number) => `${n.toFixed(2)} m`;

function movement(change: DigestChange | null): string {
  if (!change) return '';
  if (change.cm === 0) return 'Sin cambios desde ayer';

  return `${change.cm > 0 ? 'Subió' : 'Bajó'} ${Math.abs(change.cm)} cm desde ayer`;
}

function alertPhrase(r: DigestReading): string {
  const { alertLevel: alert, evacuationLevel: evac } = r;
  if (alert === undefined || !Number.isFinite(alert)) return '';

  if (evac !== undefined && Number.isFinite(evac) && r.level >= evac) {
    return 'Supera el nivel de evacuación';
  }
  if (r.level >= alert) return 'Supera el nivel de alerta';

  return `A ${m(alert - r.level)} del nivel de alerta`;
}

/**
 * The message for one device, or null when there is nothing honest to send.
 */
export function composeDaily(
  stationName: string,
  reading: DigestReading | null,
  change: DigestChange | null,
  now: Date = new Date(),
): DigestMessage | null {
  if (!reading || !Number.isFinite(reading.level)) return null;

  const ageH = (now.getTime() - new Date(reading.timestamp).getTime()) / 3600_000;
  if (!Number.isFinite(ageH) || ageH > MAX_READING_AGE_H) return null;

  const alert = alertPhrase(reading);
  const moved = movement(change);

  // Close to the alert, the margin leads: the daily habit is not what matters
  // that morning. The rest of the time the movement is the reason to read on.
  const near =
    reading.alertLevel !== undefined &&
    Number.isFinite(reading.alertLevel) &&
    reading.alertLevel - reading.level <= NEAR_ALERT_M;

  const parts = (near ? [alert, moved] : [moved, alert]).filter(Boolean);

  return {
    title: `${stationName} · ${m(reading.level)}`,
    body: `${parts.join('. ')}.`,
    data: { screen: 'notifications' },
  };
}
