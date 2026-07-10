import { describe, it, expect } from 'vitest';
import { parseWaterLevel, buildRiverUrl } from '../../src/scrapers/river.js';

const HTML = `
<table>
<tr><td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 00:00</td><td>2.77 Mts</td></tr>
<tr><td><i class="fa fa-calendar"></i> 2026-01-15 <i class="fa fa-clock-o"></i> 00:00</td><td>2.50 Mts</td></tr>
</table>`;

describe('parseWaterLevel', () => {
  it('extracts latest level and rising trend', () => {
    const wl = parseWaterLevel(HTML, 'parana');
    expect(wl?.level).toBe(2.77);
    expect(wl?.trend).toBe('rising');
    expect(wl?.stationId).toBe('parana');
    expect(typeof wl?.timestamp).toBe('string');
  });

  it('returns null when no rows', () => {
    expect(parseWaterLevel('<table></table>', 'parana')).toBeNull();
  });
});

describe('buildRiverUrl', () => {
  it('builds the historico URL with the station code', () => {
    expect(buildRiverUrl('230')).toBe(
      'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=230'
    );
  });
});
