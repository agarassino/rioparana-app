// Recommending the app itself, which is a different message from forwarding a
// reading: the person receiving this has never heard of it.

export const PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.syloper.rioparanaapp';

export interface AppShareContext {
  stationName: string;
  level: number;
}

/**
 * The message. A reading is included when the sender is looking at one, because
 * a concrete number is what makes a recommendation land — but the message works
 * without it.
 */
export function appShareMessage(now?: AppShareContext): string {
  // 38 checked against /public/river; see docs/research/store-listing-es-AR.md
  // for the rule about numbers in copy.
  const lines = [
    'Altura del río Paraná en 38 estaciones, con los datos públicos de la Prefectura Naval Argentina.',
  ];

  if (now) lines.push(`Ahora mismo ${now.stationName} está en ${now.level.toFixed(2)} m.`);

  lines.push('', PLAY_URL);

  return lines.join('\n');
}
