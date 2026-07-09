import { Station } from '../types';

// IDs de Prefectura Naval Argentina (PNA)
// Fuente: https://contenidosweb.prefecturanaval.gob.ar/alturas/
export const STATIONS: Station[] = [
  // Alto Paraná
  { id: 'corrientes', name: 'Corrientes', code: '130', latitude: -27.4667, longitude: -58.8333, province: 'Corrientes' },
  { id: 'barranqueras', name: 'Barranqueras', code: '140', latitude: -27.4833, longitude: -58.9333, province: 'Chaco' },
  { id: 'goya', name: 'Goya', code: '170', latitude: -29.1333, longitude: -59.2667, province: 'Corrientes' },

  // Paraná Medio
  { id: 'reconquista', name: 'Reconquista', code: '180', latitude: -29.15, longitude: -59.65, province: 'Santa Fe' },
  { id: 'santa-fe', name: 'Santa Fe', code: '240', latitude: -31.6333, longitude: -60.7, province: 'Santa Fe' },
  { id: 'parana', name: 'Paraná', code: '230', latitude: -31.7333, longitude: -60.5167, province: 'Entre Ríos' },

  // Paraná Inferior
  { id: 'rosario', name: 'Rosario', code: '280', latitude: -32.95, longitude: -60.65, province: 'Santa Fe' },
  { id: 'san-nicolas', name: 'San Nicolás', code: '300', latitude: -33.3333, longitude: -60.2167, province: 'Buenos Aires' },
  { id: 'villa-constitucion', name: 'Villa Constitución', code: '290', latitude: -33.2333, longitude: -60.3333, province: 'Santa Fe' },
  { id: 'san-lorenzo', name: 'San Lorenzo', code: '270', latitude: -32.75, longitude: -60.7333, province: 'Santa Fe' },
];

export const STATIONS_BY_REGION = {
  'Alto Paraná': STATIONS.filter(s => ['corrientes', 'barranqueras', 'goya'].includes(s.id)),
  'Paraná Medio': STATIONS.filter(s => ['reconquista', 'santa-fe', 'parana'].includes(s.id)),
  'Paraná Inferior': STATIONS.filter(s => ['rosario', 'san-nicolas', 'villa-constitucion', 'san-lorenzo'].includes(s.id)),
};

export function getStationById(id: string): Station | undefined {
  return STATIONS.find(s => s.id === id);
}

export function getNearestStation(lat: number, lon: number): Station {
  let nearest = STATIONS[0];
  let minDist = Infinity;

  for (const station of STATIONS) {
    const dist = Math.sqrt(
      Math.pow(station.latitude - lat, 2) + Math.pow(station.longitude - lon, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }

  return nearest;
}
