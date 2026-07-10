import { describe, it, expect, vi } from 'vitest';
import { parseWaterLevel, buildRiverUrl, fetchWaterLevel } from '../../src/scrapers/river.js';
import type { Station } from '../../src/types.js';

const HTML = `
<table>
<tr><td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 00:00</td><td>2.77 Mts</td></tr>
<tr><td><i class="fa fa-calendar"></i> 2026-01-15 <i class="fa fa-clock-o"></i> 00:00</td><td>2.50 Mts</td></tr>
</table>`;

const FALLING_HTML = `
<table>
<tr><td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 00:00</td><td>2.40 Mts</td></tr>
<tr><td><i class="fa fa-calendar"></i> 2026-01-15 <i class="fa fa-clock-o"></i> 00:00</td><td>2.50 Mts</td></tr>
</table>`;

const SINGLE_ROW_HTML = `
<table>
<tr><td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 12:30</td><td>2.65 Mts</td></tr>
</table>`;

describe('parseWaterLevel', () => {
  it('extracts latest level and rising trend', () => {
    const wl = parseWaterLevel(HTML, 'parana');
    expect(wl?.level).toBe(2.77);
    expect(wl?.trend).toBe('rising');
    expect(wl?.stationId).toBe('parana');
    expect(typeof wl?.timestamp).toBe('string');
  });

  it('extracts level and falling trend', () => {
    const wl = parseWaterLevel(FALLING_HTML, 'parana');
    expect(wl?.level).toBe(2.40);
    expect(wl?.trend).toBe('falling');
    expect(wl?.changeRate).toBeLessThan(0);
  });

  it('returns stable trend and zero changeRate for single row', () => {
    const wl = parseWaterLevel(SINGLE_ROW_HTML, 'parana');
    expect(wl?.level).toBe(2.65);
    expect(wl?.trend).toBe('stable');
    expect(wl?.changeRate).toBe(0);
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

describe('fetchWaterLevel', () => {
  const mockStation: Station = {
    id: 'parana',
    name: 'Paraná',
    code: '230',
    latitude: -31.7333,
    longitude: -60.5167,
    province: 'Entre Ríos',
  };

  it('throws when fetch response is not ok', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchWaterLevel(mockStation, fakeFetch)).rejects.toThrow('HTTP 500');
  });

  it('returns parsed WaterLevel when fetch succeeds', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SINGLE_ROW_HTML,
    });

    const result = await fetchWaterLevel(mockStation, fakeFetch);

    expect(result).not.toBeNull();
    expect(result?.stationId).toBe('parana');
    expect(result?.level).toBe(2.65);
    expect(result?.trend).toBe('stable');

    expect(fakeFetch).toHaveBeenCalledWith(
      'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=230',
      {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'ParanaInfo-Server/1.0',
        },
        signal: expect.any(AbortSignal),
      }
    );
  });
});
