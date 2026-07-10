import { describe, it, expect } from 'vitest';
import { parseNews } from '../../src/scrapers/news.js';

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
