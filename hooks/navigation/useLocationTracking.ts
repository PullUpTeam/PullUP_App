// hooks/useLocationTracking.ts
import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';

interface LocationTrackingReturn {
    driverLocation: { latitude: number; longitude: number } | null;
    locationLoading: boolean;
    locationError: string | null;
}

interface UseLocationTrackingProps {
    onLocationError?: () => void;
}

export const useLocationTracking = ({ onLocationError }: UseLocationTrackingProps = {}): LocationTrackingReturn => {
    const [driverLocation, setDriverLocation] = useState<{
        latitude: number;
        longitude: number;
    } | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);
    const [locationError, setLocationError] = useState<string | null>(null);

    const locationSubscription = useRef<Location.LocationSubscription | null>(null);

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

                // Get initial location
                const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High
                });

                if (isMounted) {
                    const coords = {
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude
                    };
                    setDriverLocation(coords);
                    setLocationLoading(false);
                    setLocationError(null);

                    console.log('📍 Initial driver location:', {
                        lat: coords.latitude,
                        lng: coords.longitude
                    });
                }

                // Start watching location
                locationSubscription.current = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.BestForNavigation,
                        timeInterval: 1000,
                        distanceInterval: 5
                    },
                    (newLocation) => {
                        if (isMounted) {
                            setDriverLocation({
                                latitude: newLocation.coords.latitude,
                                longitude: newLocation.coords.longitude
                            });
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
        };
    }, [onLocationError]);

    return {
        driverLocation,
        locationLoading,
        locationError
    };
};