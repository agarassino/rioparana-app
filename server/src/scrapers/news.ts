import { NewsItem } from '../types.js';

export const NEWS_URL = 'https://www.argentina.gob.ar/prefecturanaval/noticias-pna';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&oacute;/g, 'ó')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNews(html: string): NewsItem[] {
  const news: NewsItem[] = [];
  const seen = new Set<string>();
  const pattern =
    /<a[^>]*href="(\/noticias\/[^"]+)"[^>]*class="panel[^"]*"[^>]*>[\s\S]*?<time[^>]*>([^<]*)<\/time>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null && news.length < 10) {
    const url = m[1];
    const date = m[2].trim();
    const title = m[3].trim();
    if (seen.has(url) || !title) continue;
    seen.add(url);
    news.push({
      id: url,
      title: decodeHtmlEntities(title),
      date,
      url: `https://www.argentina.gob.ar${url}`,
    });
  }
  return news;
}

export async function fetchNews(fetchFn: typeof fetch = fetch): Promise<NewsItem[]> {
  const res = await fetchFn(NEWS_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'ParanaInfo-Server/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseNews(await res.text());
}
