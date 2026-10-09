// Argentina-local date formatting shared by the build-time snapshot
// (build-directory.mjs) and the daily INA refresh (scripts/refresh-river-landing.mjs),
// so a baked date can never disagree about its own shape depending on which
// script wrote it.

const TZ = 'America/Argentina/Buenos_Aires';

const ISO_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const PROSA_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric',
});

/** YYYY-MM-DD in America/Argentina/Buenos_Aires, for a <time datetime="..."> value. */
export const isoDateAR = (date) => ISO_FMT.format(date);

/** "8 de octubre de 2026" in America/Argentina/Buenos_Aires, for display. */
export const prosaDateAR = (date) => PROSA_FMT.format(date);
