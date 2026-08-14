import { Station } from '../types.js';

// Copied verbatim from the app (src/config/stations.ts). PNA station codes.
// IDs de Prefectura Naval Argentina (PNA)
// Fuente: https://contenidosweb.prefecturanaval.gob.ar/alturas/
//
// Las coordenadas corresponden a la localidad o puerto de cada estación. PNA no
// publica la posición del hidrómetro, y la precisión alcanza porque las
// estaciones están separadas por decenas de kilómetros.
export const STATIONS: Station[] = [
  // Alto Paraná
  { id: 'libertad', name: 'Puerto Libertad', code: '30', latitude: -25.9167, longitude: -54.6167, province: 'Misiones' },
  { id: 'eldorado', name: 'Eldorado', code: '40', latitude: -26.3667, longitude: -54.65, province: 'Misiones' },
  { id: 'santa-ana', name: 'Santa Ana', code: '70', latitude: -27.3667, longitude: -55.5833, province: 'Misiones' },
  { id: 'posadas', name: 'Posadas', code: '80', latitude: -27.3667, longitude: -55.8967, province: 'Misiones' },
  { id: 'ituzaingo', name: 'Ituzaingó', code: '90', latitude: -27.5833, longitude: -56.6833, province: 'Corrientes' },
  { id: 'ita-ibate', name: 'Itá Ibaté', code: '100', latitude: -27.4333, longitude: -57.3333, province: 'Corrientes' },
  { id: 'itati', name: 'Itatí', code: '110', latitude: -27.2667, longitude: -58.25, province: 'Corrientes' },
  { id: 'paso-de-la-patria', name: 'Paso de la Patria', code: '120', latitude: -27.3167, longitude: -58.5667, province: 'Corrientes' },

  // Paraná Medio
  { id: 'corrientes', name: 'Corrientes', code: '130', latitude: -27.4667, longitude: -58.8333, province: 'Corrientes' },
  { id: 'barranqueras', name: 'Barranqueras', code: '140', latitude: -27.4833, longitude: -58.9333, province: 'Chaco' },
  { id: 'empedrado', name: 'Empedrado', code: '150', latitude: -27.95, longitude: -58.8, province: 'Corrientes' },
  { id: 'bella-vista', name: 'Bella Vista', code: '160', latitude: -28.5167, longitude: -59.0333, province: 'Corrientes' },
  { id: 'goya', name: 'Goya', code: '170', latitude: -29.1333, longitude: -59.2667, province: 'Corrientes' },
  { id: 'reconquista', name: 'Reconquista', code: '180', latitude: -29.15, longitude: -59.65, province: 'Santa Fe' },
  { id: 'esquina', name: 'Esquina', code: '190', latitude: -30.0167, longitude: -59.5333, province: 'Corrientes' },
  { id: 'la-paz', name: 'La Paz', code: '200', latitude: -30.75, longitude: -59.65, province: 'Entre Ríos' },
  { id: 'santa-elena', name: 'Santa Elena', code: '210', latitude: -30.95, longitude: -59.7833, province: 'Entre Ríos' },
  { id: 'hernandarias', name: 'Hernandarias', code: '220', latitude: -31.2333, longitude: -59.9833, province: 'Entre Ríos' },
  { id: 'parana', name: 'Paraná', code: '230', latitude: -31.7333, longitude: -60.5167, province: 'Entre Ríos' },
  { id: 'santa-fe', name: 'Santa Fe', code: '240', latitude: -31.6333, longitude: -60.7, province: 'Santa Fe' },
  { id: 'diamante', name: 'Diamante', code: '250', latitude: -32.0667, longitude: -60.65, province: 'Entre Ríos' },

  // Paraná Inferior
  { id: 'victoria', name: 'Victoria', code: '260', latitude: -32.6167, longitude: -60.15, province: 'Entre Ríos' },
  { id: 'san-lorenzo', name: 'San Lorenzo', code: '270', latitude: -32.75, longitude: -60.7333, province: 'Santa Fe' },
  { id: 'rosario', name: 'Rosario', code: '280', latitude: -32.95, longitude: -60.65, province: 'Santa Fe' },
  { id: 'villa-constitucion', name: 'Villa Constitución', code: '290', latitude: -33.2333, longitude: -60.3333, province: 'Santa Fe' },
  { id: 'san-nicolas', name: 'San Nicolás', code: '300', latitude: -33.3333, longitude: -60.2167, province: 'Buenos Aires' },
  { id: 'ramallo', name: 'Ramallo', code: '310', latitude: -33.4833, longitude: -60.0, province: 'Buenos Aires' },

  // Delta
  { id: 'san-pedro', name: 'San Pedro', code: '320', latitude: -33.6833, longitude: -59.6667, province: 'Buenos Aires' },
  { id: 'baradero', name: 'Baradero', code: '330', latitude: -33.8, longitude: -59.5, province: 'Buenos Aires' },
  { id: 'zarate', name: 'Zárate', code: '340', latitude: -34.1, longitude: -59.0333, province: 'Buenos Aires' },
  { id: 'campana', name: 'Campana', code: '350', latitude: -34.1667, longitude: -58.95, province: 'Buenos Aires' },
  { id: 'escobar', name: 'Escobar', code: '360', latitude: -34.35, longitude: -58.7833, province: 'Buenos Aires' },
  { id: 'martin-garcia', name: 'Isla Martín García', code: '410', latitude: -34.1833, longitude: -58.25, province: 'Buenos Aires' },
  { id: 'dique-lujan', name: 'Dique Luján', code: '440', latitude: -34.3667, longitude: -58.6667, province: 'Buenos Aires' },
  { id: 'tigre', name: 'Tigre', code: '430', latitude: -34.4167, longitude: -58.5833, province: 'Buenos Aires' },
  { id: 'san-fernando', name: 'San Fernando', code: '460', latitude: -34.4333, longitude: -58.5667, province: 'Buenos Aires' },
  { id: 'san-isidro', name: 'San Isidro', code: '470', latitude: -34.4667, longitude: -58.5167, province: 'Buenos Aires' },
  { id: 'olivos', name: 'Olivos', code: '480', latitude: -34.5, longitude: -58.4833, province: 'Buenos Aires' },
];

export function getStationByCode(code: string): Station | undefined {
  return STATIONS.find((s) => s.code === code);
}

export function getStationById(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}
