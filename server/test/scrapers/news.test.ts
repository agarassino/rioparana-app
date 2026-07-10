import { describe, it, expect, vi } from 'vitest';
import { parseNews, fetchNews, NEWS_URL } from '../../src/scrapers/news.js';

const HTML = `
<a href="/noticias/prefectura-aniversario" class="panel panel-default">
  <time>09 de julio de 2026</time>
  <h3>Prefectura conmemoró el aniversario</h3>
</a>
<a href="/noticias/otra-noticia" class="panel">
  <time>08 de julio de 2026</time>
  <h3>Segunda noticia</h3>
</a>`;

describe('parseNews', () => {
  it('parses items with decoded titles and absolute urls', () => {
    const items = parseNews(HTML);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('/noticias/prefectura-aniversario');
    expect(items[0].title).toBe('Prefectura conmemoró el aniversario');
    expect(items[0].url).toBe('https://www.argentina.gob.ar/noticias/prefectura-aniversario');
  });

  it('returns empty array for no matches', () => {
    expect(parseNews('<div>nada</div>')).toEqual([]);
  });
});

describe('fetchNews', () => {
  it('throws when fetch response is not ok', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchNews(fakeFetch)).rejects.toThrow('HTTP 500');
  });

  it('returns parsed NewsItems when fetch succeeds', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => HTML,
    });

    const result = await fetchNews(fakeFetch);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('/noticias/prefectura-aniversario');
    expect(result[0].title).toBe('Prefectura conmemoró el aniversario');
    expect(result[0].url).toBe('https://www.argentina.gob.ar/noticias/prefectura-aniversario');

    expect(fakeFetch).toHaveBeenCalledWith(NEWS_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'ParanaInfo-Server/1.0',
      },
    });
  });
});
