// Servicio para obtener noticias de Prefectura Naval Argentina
// Fuente: https://www.argentina.gob.ar/prefecturanaval/noticias-pna

import { NewsItem } from '../../types';
import { supabase, NewsCacheRow } from '../supabase';

const NEWS_URL = 'https://www.argentina.gob.ar/prefecturanaval/noticias-pna';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

let memoryCachedNews: NewsItem[] | null = null;
let memoryCacheTimestamp: number = 0;

// Guardar noticias en Supabase
async function saveToSupabase(news: NewsItem[]): Promise<void> {
  try {
    // Primero eliminar noticias antiguas
    await supabase.from('news_cache').delete().neq('news_id', '');

    // Insertar las nuevas
    const rows: NewsCacheRow[] = news.map(item => ({
      news_id: item.id,
      title: item.title,
      date: item.date || null,
      url: item.url,
    }));

    await supabase.from('news_cache').insert(rows);
  } catch (error) {
    console.log('Error saving news to Supabase:', error);
  }
}

// Leer noticias de Supabase (fallback)
async function getFromSupabase(): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('news_cache')
      .select('*')
      .order('fetched_at', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) return [];

    return data.map(row => ({
      id: row.news_id,
      title: row.title,
      date: row.date || '',
      url: row.url,
    }));
  } catch (error) {
    console.log('Error reading news from Supabase:', error);
    return [];
  }
}

function parseHtmlToNews(html: string): NewsItem[] {
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  // Patrón para la estructura real de argentina.gob.ar
  const newsPattern = /<a[^>]*href="(\/noticias\/[^"]+)"[^>]*class="panel[^"]*"[^>]*>[\s\S]*?<time[^>]*>([^<]*)<\/time>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<\/a>/gi;

  let match;
  while ((match = newsPattern.exec(html)) !== null && news.length < 10) {
    const url = match[1];
    const date = match[2].trim();
    const title = match[3].trim();

    if (seen.has(url) || !title) continue;
    seen.add(url);

    news.push({
      id: url,
      title: decodeHtmlEntities(title),
      date: date,
      url: `https://www.argentina.gob.ar${url}`,
    });
  }

  return news;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getNews(): Promise<NewsItem[]> {
  // Verificar cache en memoria primero
  const now = Date.now();
  if (memoryCachedNews && (now - memoryCacheTimestamp) < CACHE_DURATION) {
    return memoryCachedNews;
  }

  try {
    const response = await fetch(NEWS_URL, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'ParanaInfo-App/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const news = parseHtmlToNews(html);

    if (news.length > 0) {
      memoryCachedNews = news;
      memoryCacheTimestamp = now;

      // Guardar en Supabase para futuro fallback
      saveToSupabase(news);

      return news;
    }

    // Si no se encontraron noticias, intentar Supabase
    console.log('No news parsed, trying Supabase');
    return await getFromSupabase();
  } catch (error: any) {
    console.log('❌ News Scraping Error:', {
      message: error?.message,
      type: error?.name,
      url: NEWS_URL,
    });

    // Si hay cache en memoria aunque esté vencido, usarlo
    if (memoryCachedNews) {
      return memoryCachedNews;
    }

    // Intentar Supabase
    return await getFromSupabase();
  }
}

export const NEWS_PAGE_URL = NEWS_URL;
