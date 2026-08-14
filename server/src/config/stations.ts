import { Station } from '../types.js';

// Copied verbatim from the app (src/config/stations.ts). PNA station codes.
export const STATIONS: Station[] = [
  { id: 'corrientes', name: 'Corrientes', code: '130', latitude: -27.4667, longitude: -58.8333, province: 'Corrientes' },
  { id: 'barranqueras', name: 'Barranqueras', code: '140', latitude: -27.4833, longitude: -58.9333, province: 'Chaco' },
  { id: 'goya', name: 'Goya', code: '170', latitude: -29.1333, longitude: -59.2667, province: 'Corrientes' },
  { id: 'reconquista', name: 'Reconquista', code: '180', latitude: -29.15, longitude: -59.65, province: 'Santa Fe' },
  { id: 'santa-fe', name: 'Santa Fe', code: '240', latitude: -31.6333, longitude: -60.7, province: 'Santa Fe' },
  { id: 'parana', name: 'Paraná', code: '230', latitude: -31.7333, longitude: -60.5167, province: 'Entre Ríos' },
  { id: 'rosario', name: 'Rosario', code: '280', latitude: -32.95, longitude: -60.65, province: 'Santa Fe' },
  { id: 'san-nicolas', name: 'San Nicolás', code: '300', latitude: -33.3333, longitude: -60.2167, province: 'Buenos Aires' },
  { id: 'villa-constitucion', name: 'Villa Constitución', code: '290', latitude: -33.2333, longitude: -60.3333, province: 'Santa Fe' },
  { id: 'san-lorenzo', name: 'San Lorenzo', code: '270', latitude: -32.75, longitude: -60.7333, province: 'Santa Fe' },
];

export function getStationByCode(code: string): Station | undefined {
  return STATIONS.find((s) => s.code === code);
}

export function getStationById(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}
