import { WaterLevel } from '../types';
import { getAlertInfo } from './riverAlert';
import { DayChange } from './riverTrend';

// The message a reader forwards to the group they fish with. It has to arrive
// useful on its own: someone who receives it should learn what the river is
// doing without opening anything.

const SITE = 'https://rioparana.com.ar';
// The message gets forwarded on past anyone who knows where it came from, so it
// signs itself.
const SIGNATURE = 'Vía Paraná Info';

export function shareMessage(
  stationName: string,
  level: WaterLevel,
  day: DayChange | null = null,
  localitySlug?: string
): string {
  const info = getAlertInfo(level);
  // The distance to alert travels only when the river is close enough for it to
  // mean something. Two and a half metres of margin is noise in a chat.
  const alert =
    info === null || info.status === 'normal'
      ? ''
      : info.metersToAlert > 0
        ? ` — a ${info.metersToAlert.toFixed(2)} m del nivel de alerta`
        : ' — supera el nivel de alerta';

  const head = `Altura del río Paraná en ${stationName}: ${level.level.toFixed(2)} m${alert}`;

  const movement = day
    ? `\n${day.cm === 0 ? 'Sin cambios' : `${day.cm > 0 ? 'Subió' : 'Bajó'} ${Math.abs(day.cm)} cm`}` +
      ` en las últimas ${day.hours} h`
    : '';

  // The locality page carries the same reading plus the chart and the listings;
  // the home page is the honest fallback for a station without one.
  const url = localitySlug ? `${SITE}/rio/${localitySlug}/` : `${SITE}/`;

  return `${head}${movement}\n\n${SIGNATURE}\n${url}`;
}
