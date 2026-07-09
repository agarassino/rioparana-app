import axios from 'axios';
import { LocationWeather, CurrentWeather, WeatherForecast } from '../../types';
import { supabase, WeatherCacheRow } from '../supabase';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Guardar clima en Supabase
async function saveToSupabase(lat: number, lon: number, weather: LocationWeather): Promise<void> {
  try {
    const row: WeatherCacheRow = {
      latitude: lat,
      longitude: lon,
      data: weather as object,
    };

    await supabase
      .from('weather_cache')
      .upsert(row, { onConflict: 'latitude,longitude' });
  } catch (error) {
    console.log('Error saving weather to Supabase:', error);
  }
}

// Leer clima de Supabase (fallback)
async function getFromSupabase(lat: number, lon: number): Promise<LocationWeather | null> {
  try {
    // Buscar con tolerancia de ~1km (0.01 grados)
    const { data, error } = await supabase
      .from('weather_cache')
      .select('*')
      .gte('latitude', lat - 0.01)
      .lte('latitude', lat + 0.01)
      .gte('longitude', lon - 0.01)
      .lte('longitude', lon + 0.01)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    const cached = data.data as LocationWeather;

    // Reconstruir las fechas
    return {
      ...cached,
      current: {
        ...cached.current,
        timestamp: new Date(cached.current.timestamp),
      },
      daily: cached.daily.map(day => ({
        ...day,
        date: new Date(day.date),
      })),
    };
  } catch (error) {
    console.log('Error reading weather from Supabase:', error);
    return null;
  }
}

export async function getWeather(latitude: number, longitude: number): Promise<LocationWeather> {
  try {
    const response = await axios.get(OPEN_METEO_URL, {
      params: {
        latitude,
        longitude,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'America/Argentina/Buenos_Aires',
        forecast_days: 7,
      },
      timeout: 10000,
    });

    const data = response.data;

    const weather: LocationWeather = {
      latitude,
      longitude,
      current: parseCurrentWeather(data.current),
      daily: parseDailyForecast(data.daily),
    };

    // Guardar en Supabase para futuro fallback
    saveToSupabase(latitude, longitude, weather);

    return weather;
  } catch (error: any) {
    console.log('❌ Weather API Error:', {
      latitude,
      longitude,
      message: error?.message,
      code: error?.code,
      status: error?.response?.status,
      url: OPEN_METEO_URL,
    });
    const cached = await getFromSupabase(latitude, longitude);
    if (cached) return cached;

    // Si no hay cache, devolver objeto vacío con valores por defecto
    throw new Error('No weather data available');
  }
}

function parseCurrentWeather(current: any): CurrentWeather {
  const code = current.weather_code;
  return {
    temperature: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    windDirection: degreesToDirection(current.wind_direction_10m),
    description: getWeatherDescription(code),
    icon: getWeatherIcon(code),
    timestamp: new Date(current.time),
  };
}

function parseDailyForecast(daily: any): WeatherForecast[] {
  const forecasts: WeatherForecast[] = [];
  for (let i = 0; i < daily.time.length; i++) {
    forecasts.push({
      date: new Date(daily.time[i]),
      tempMax: Math.round(daily.temperature_2m_max[i]),
      tempMin: Math.round(daily.temperature_2m_min[i]),
      description: getWeatherDescription(daily.weather_code[i]),
      icon: getWeatherIcon(daily.weather_code[i]),
      precipProbability: daily.precipitation_probability_max[i] || 0,
    });
  }
  return forecasts;
}

function degreesToDirection(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(degrees / 45) % 8];
}

function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado',
    3: 'Nublado', 45: 'Niebla', 48: 'Niebla', 51: 'Llovizna',
    53: 'Llovizna', 55: 'Llovizna', 61: 'Lluvia', 63: 'Lluvia moderada',
    65: 'Lluvia intensa', 80: 'Chubascos', 81: 'Chubascos', 82: 'Chubascos',
    95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta severa',
  };
  return descriptions[code] || 'Desconocido';
}

function getWeatherIcon(code: number): string {
  if (code === 0) return 'sun';
  if (code <= 3) return 'cloud-sun';
  if (code <= 48) return 'cloud';
  if (code <= 65) return 'cloud-rain';
  if (code <= 82) return 'cloud-showers-heavy';
  return 'bolt';
}
