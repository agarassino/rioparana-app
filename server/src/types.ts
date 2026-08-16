export type Trend = 'rising' | 'falling' | 'stable';

export interface WaterLevel {
  stationId: string;
  level: number;
  trend: Trend;
  changeRate: number;
  timestamp: string; // ISO 8601
  // Heights at which Prefectura declares alert and evacuation for the station.
  alertLevel?: number;
  evacuationLevel?: number;
}

export interface StoredWaterLevel extends WaterLevel {
  updatedAt: string; // ISO 8601
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  url: string;
}

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
  timestamp: string; // ISO 8601
}

export interface WeatherForecast {
  date: string; // ISO 8601
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

export interface Station {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  province: string;
}
