// hooks/navigation/useLocationTracking.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { useSmoothedHeading } from './useSmoothedHeading';

export interface DriverLocationData {
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    accuracy: number;
    timestamp: number;
}

interface LocationTrackingReturn {
    driverLocation: DriverLocationData | null;
    locationLoading: boolean;
    locationError: string | null;
    // Raw heading (unsmoothed) for debugging
    rawHeading: number;
}

interface UseLocationTrackingProps {
    onLocationError?: () => void;
    // Callback fired on each location update (for real-time camera following)
    onLocationUpdate?: (location: DriverLocationData) => void;
    // Minimum time between updates in ms (default: 500ms for smoother updates)
    updateInterval?: number;
    // Minimum distance change in meters to trigger update (default: 2m)
    distanceInterval?: number;
}

export const useLocationTracking = ({
    onLocationError,
    onLocationUpdate,
    updateInterval = 500,
    distanceInterval = 2
}: UseLocationTrackingProps = {}): LocationTrackingReturn => {
    const [driverLocation, setDriverLocation] = useState<DriverLocationData | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [rawHeading, setRawHeading] = useState(0);

    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const headingSubscription = useRef<Location.LocationSubscription | null>(null);
    const lastUpdateTime = useRef<number>(0);

    // Use smoothed heading for better camera rotation
    const { addHeading } = useSmoothedHeading({
        bufferSize: 5,
        minDelta: 2,
        maxSampleAge: 3000,
        decayFactor: 0.6
    });

    // Stable callback reference
    const onLocationUpdateRef = useRef(onLocationUpdate);
    onLocationUpdateRef.current = onLocationUpdate;

    const processLocationUpdate = useCallback((
        coords: Location.LocationObjectCoords,
        timestamp: number
    ) => {
        const now = Date.now();

        // Throttle updates
        if (now - lastUpdateTime.current < updateInterval) {
            return;
        }
        lastUpdateTime.current = now;

        // Get raw heading from GPS
        const gpsHeading = coords.heading ?? 0;
        setRawHeading(gpsHeading);

        // Smooth the heading
        const smoothedHeading = addHeading(gpsHeading);

        const locationData: DriverLocationData = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            heading: smoothedHeading,
            speed: coords.speed ?? 0,
            accuracy: coords.accuracy ?? 0,
            timestamp
        };

        setDriverLocation(locationData);

        // Notify listener for real-time camera updates
        onLocationUpdateRef.current?.(locationData);
    }, [updateInterval, addHeading]);

    useEffect(() => {
        let isMounted = true;

        const initializeLocation = async () => {
            try {
                // Request location permissions
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    if (isMounted) {
                        const errorMsg = 'Location permission is required for navigation';
                        setLocationError(errorMsg);
                        setLocationLoading(false);
                        Alert.alert(
                            'Permission Denied',
                            errorMsg,
                            [{ text: 'OK', onPress: onLocationError }]
                        );
                    }
                    return;
                }

                // Get initial location with high accuracy
                const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.BestForNavigation
                });

                if (isMounted) {
                    const initialHeading = location.coords.heading ?? 0;
                    const smoothedHeading = addHeading(initialHeading);

                    const initialLocation: DriverLocationData = {
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        heading: smoothedHeading,
                        speed: location.coords.speed ?? 0,
                        accuracy: location.coords.accuracy ?? 0,
                        timestamp: location.timestamp
                    };

                    setDriverLocation(initialLocation);
                    setRawHeading(initialHeading);
                    setLocationLoading(false);
                    setLocationError(null);

                    console.log('📍 Initial driver location:', {
                        lat: initialLocation.latitude.toFixed(6),
                        lng: initialLocation.longitude.toFixed(6),
                        heading: initialLocation.heading.toFixed(1)
                    });
                }

                // Start watching location with high frequency for smooth camera
                locationSubscription.current = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.BestForNavigation,
                        timeInterval: updateInterval,
                        distanceInterval: distanceInterval
                    },
                    (newLocation) => {
                        if (isMounted) {
                            processLocationUpdate(
                                newLocation.coords,
                                newLocation.timestamp
                            );
                        }
                    }
                );
            } catch (error) {
                console.error('❌ Error getting location:', error);
                if (isMounted) {
                    const errorMsg = 'Unable to get your current location';
                    setLocationError(errorMsg);
                    setLocationLoading(false);
                    Alert.alert(
                        'Location Error',
                        errorMsg,
                        [{ text: 'OK', onPress: onLocationError }]
                    );
                }
            }
        };

        initializeLocation();

        return () => {
            isMounted = false;
            if (locationSubscription.current) {
                locationSubscription.current.remove();
                locationSubscription.current = null;
            }
            if (headingSubscription.current) {
                headingSubscription.current.remove();
                headingSubscription.current = null;
            }
        };
    }, [onLocationError, updateInterval, distanceInterval, processLocationUpdate, addHeading]);

    return {
        driverLocation,
        locationLoading,
        locationError,
        rawHeading
    };
};