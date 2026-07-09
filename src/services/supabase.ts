import { createClient } from '@supabase/supabase-js';

// Environment variables - create .env.local from .env.example
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mbdqfcbkwwogmelwvxpl.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZHFmY2Jrd3dvZ21lbHd2eHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTUyMTgsImV4cCI6MjA4NDY3MTIxOH0.Rq0jLtJtCMTP0QiEye2JefMQg1IWFN7h2n8SByfpQgQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tipos para las tablas
export interface WaterLevelRow {
  id?: number;
  station_id: string;
  level: number;
  trend: string;
  change_rate: number;
  timestamp: string;
  fetched_at?: string;
}

export interface WeatherCacheRow {
  id?: number;
  latitude: number;
  longitude: number;
  data: object;
  fetched_at?: string;
}

export interface NewsCacheRow {
  id?: number;
  news_id: string;
  title: string;
  date: string | null;
  url: string;
  fetched_at?: string;
}
