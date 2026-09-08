// Which page on rioparana.com.ar covers a station, so a shared reading points
// at somewhere useful instead of the home page.
//
// The slug matches the station id for all but two places, where the site uses
// the full name. test/localityPages.test.ts checks this against the site's own
// data, so a station added without a page fails there rather than shipping a
// dead link into a WhatsApp group.
const EXCEPTIONS: Record<string, string> = {
  libertad: 'puerto-libertad',
  'martin-garcia': 'isla-martin-garcia',
};

export function localitySlugFor(stationId: string): string {
  return EXCEPTIONS[stationId] ?? stationId;
}
