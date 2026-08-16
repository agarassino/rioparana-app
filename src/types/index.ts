// Tipos para estaciones y niveles del río
export interface Station {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  province: string;
}

export interface WaterLevel {
  stationId: string;
  timestamp: Date;
  level: number;
  trend: 'rising' | 'falling' | 'stable';
  changeRate: number;
  // Alturas a las que Prefectura declara alerta y evacuación en la estación.
  alertLevel?: number;
  evacuationLevel?: number;
}

// Tipos para clima
export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
  timestamp: Date;
}

export interface WeatherForecast {
  date: Date;
  tempMax: number;
  tempMin: number;
  description: string;
  icon: string;
  precipProbability: number;
}

export interface LocationWeather {
  latitude: number;
  longitude: number;
  current: CurrentWeather;
  daily: WeatherForecast[];
}

// Tipos para noticias
export interface NewsItem {
  id: string;
  title: string;
  date: string;
  url: string;
}

// Tipos para capturas
export interface Capture {
  id: string;
  species: string;
  weight: number | null;
  length: number | null;
  released: boolean;
  location: { latitude: number; longitude: number };
  spotName: string;
  technique: string | null;
  bait: string | null;
  photos: string[];
  capturedAt: Date;
  notes: string | null;
}
