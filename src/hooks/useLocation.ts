import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { getNearestStation } from '../config/stations';
import { Station } from '../types';

interface LocationState {
  latitude: number;
  longitude: number;
  loading: boolean;
  error: string | null;
  nearestStation: Station | null;
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: -32.95, // Default: Rosario
    longitude: -60.65,
    loading: true,
    error: null,
    nearestStation: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function getLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          const defaultStation = getNearestStation(-32.95, -60.65);
          if (isMounted) {
            setState(prev => ({
              ...prev,
              loading: false,
              nearestStation: defaultStation,
              error: 'Permiso de ubicación denegado',
            }));
          }
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const { latitude, longitude } = location.coords;
        const nearestStation = getNearestStation(latitude, longitude);

        if (isMounted) {
          setState({
            latitude,
            longitude,
            loading: false,
            error: null,
            nearestStation,
          });
        }
      } catch (error) {
        const defaultStation = getNearestStation(-32.95, -60.65);
        if (isMounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            nearestStation: defaultStation,
            error: 'No se pudo obtener la ubicación',
          }));
        }
      }
    }

    getLocation();
    return () => { isMounted = false; };
  }, []);

  return state;
}
