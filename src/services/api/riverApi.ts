import { WaterLevel } from '../../types';
import { getStationById } from '../../config/stations';
import { supabase, WaterLevelRow } from '../supabase';

// Prefectura Naval Argentina - Alturas de ríos
const PNA_BASE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas';

// Guardar nivel en Supabase
async function saveToSupabase(level: WaterLevel): Promise<void> {
  try {
    const row: WaterLevelRow = {
      station_id: level.stationId,
      level: level.level,
      trend: level.trend,
      change_rate: level.changeRate,
      timestamp: level.timestamp.toISOString(),
    };

    await supabase
      .from('water_levels')
      .upsert(row, { onConflict: 'station_id' });
  } catch (error) {
    console.log('Error saving water level to Supabase:', error);
  }
}

// Leer nivel de Supabase (fallback)
async function getFromSupabase(stationId: string): Promise<WaterLevel | null> {
  try {
    const { data, error } = await supabase
      .from('water_levels')
      .select('*')
      .eq('station_id', stationId)
      .single();

    if (error || !data) return null;

    return {
      stationId: data.station_id,
      timestamp: new Date(data.timestamp),
      level: Number(data.level),
      trend: data.trend as 'rising' | 'falling' | 'stable',
      changeRate: Number(data.change_rate),
    };
  } catch (error) {
    console.log('Error reading from Supabase:', error);
    return null;
  }
}

// Parsear HTML de Prefectura Naval para extraer nivel del río
function parseWaterLevel(html: string, stationId: string): WaterLevel | null {
  try {
    // La tabla tiene formato:
    // <td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 00:00</td>
    // <td>2.77 Mts</td>

    // Extraer todas las fechas y niveles por separado
    const datePattern = /<td[^>]*><i[^>]*><\/i>\s*(\d{4}-\d{2}-\d{2})\s*<i[^>]*><\/i>\s*(\d{2}:\d{2})<\/td>/gi;
    const levelPattern = /<td[^>]*>(\d+\.?\d*)\s*Mts<\/td>/gi;

    const dates: { date: string; time: string }[] = [];
    const levels: number[] = [];

    let dateMatch;
    while ((dateMatch = datePattern.exec(html)) !== null) {
      dates.push({ date: dateMatch[1], time: dateMatch[2] });
    }

    let levelMatch;
    while ((levelMatch = levelPattern.exec(html)) !== null) {
      levels.push(parseFloat(levelMatch[1]));
    }

    if (dates.length === 0 || levels.length === 0) {
      console.log('Could not extract dates or levels from PNA HTML');
      return null;
    }

    // El primer par es el más reciente
    const currentLevel = levels[0];
    const timestamp = new Date(`${dates[0].date}T${dates[0].time}:00`);

    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    let changeRate = 0;

    if (levels.length > 1) {
      const previousLevel = levels[1];
      const diff = currentLevel - previousLevel;
      changeRate = diff * 100; // cm por período

      if (diff > 0.02) trend = 'rising';
      else if (diff < -0.02) trend = 'falling';
    }

    return {
      stationId,
      timestamp,
      level: currentLevel,
      trend,
      changeRate,
    };
  } catch (error) {
    console.log('Error parsing water level HTML:', error);
    return null;
  }
}

export async function getCurrentWaterLevel(stationId: string): Promise<WaterLevel | null> {
  const station = getStationById(stationId);
  if (!station) return null;

  const url = `${PNA_BASE_URL}/?page=historico&tiempo=7&id=${station.code}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'ParanaInfo-App/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const level = parseWaterLevel(html, stationId);

    if (level) {
      console.log(`✅ PNA data for ${stationId}:`, level.level, 'm', level.trend);
      // Guardar en Supabase para futuro fallback
      saveToSupabase(level);
      return level;
    }

    // Si no se pudo parsear, intentar Supabase
    console.log('Could not parse PNA data, trying Supabase for', stationId);
    return await getFromSupabase(stationId);
  } catch (error: any) {
    console.log('❌ PNA API Error:', {
      stationId,
      message: error?.message,
      url,
    });
    return await getFromSupabase(stationId);
  }
}

export function calculateFishingCondition(level: WaterLevel): 'optimal' | 'good' | 'regular' | 'poor' {
  const { trend, changeRate } = level;

  if (trend === 'rising' && Math.abs(changeRate) > 10) return 'poor';
  if (trend === 'falling' && Math.abs(changeRate) > 10) return 'regular';
  if (trend === 'stable' || Math.abs(changeRate) < 3) return 'optimal';
  return 'good';
}
