import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getDistance } from 'geolib';
import { GEOFENCE_CHECK_INTERVAL, GEOFENCE_RADIUS_METERS, NavigationPhase } from "@/hooks/navigation/types";

interface UseGeofencingProps {
    driverLocation: { latitude: number; longitude: number } | null;
    pickupLocation: { latitude: number; longitude: number };
    destinationLocation: { latitude: number; longitude: number };
    navigationPhase: NavigationPhase;
    onEnterPickupGeofence: () => void;
    onEnterDestinationGeofence: () => void;
}

interface GeofenceVisibility {
    showPickupGeofence: boolean;
    showDestinationGeofence: boolean;
}

export const useGeofencing = ({
    driverLocation,
    pickupLocation,
    destinationLocation,
    navigationPhase,
    onEnterPickupGeofence,
    onEnterDestinationGeofence
}: UseGeofencingProps) => {
    const [isInPickupGeofence, setIsInPickupGeofence] = useState(false);
    const [isInDestinationGeofence, setIsInDestinationGeofence] = useState(false);

    // Memoize geofence visibility to prevent unnecessary recalculations
    const geofenceVisibility = useMemo<GeofenceVisibility>(() => {
        switch (navigationPhase) {
            case 'to-pickup':
            case 'at-pickup':
                return {
                    showPickupGeofence: true,
                    showDestinationGeofence: false
                };
            case 'picking-up':
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: false
                };
            case 'to-destination':
            case 'at-destination':
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: true
                };
            case 'completed':
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: false
                };
            default:
                return {
                    showPickupGeofence: false,
                    showDestinationGeofence: false
                };
        }
    }, [navigationPhase]);

    const geofenceCheckInterval = useRef<number | null>(null);
    const hasEnteredPickup = useRef(false);
    const hasEnteredDestination = useRef(false);

    // Memoize callbacks to prevent unnecessary effect re-runs
    const stableOnEnterPickup = useCallback(() => {
        if (!hasEnteredPickup.current) {
            hasEnteredPickup.current = true;
            onEnterPickupGeofence();
        }
    }, [onEnterPickupGeofence]);

    const stableOnEnterDestination = useCallback(() => {
        if (!hasEnteredDestination.current) {
            hasEnteredDestination.current = true;
            onEnterDestinationGeofence();
        }
    }, [onEnterDestinationGeofence]);

    // Reset flags when phase changes
    useEffect(() => {
        if (navigationPhase === 'to-pickup') {
            hasEnteredPickup.current = false;
        } else if (navigationPhase === 'to-destination') {
            hasEnteredDestination.current = false;
        } else if (navigationPhase === 'completed') {
            hasEnteredPickup.current = false;
            hasEnteredDestination.current = false;
            setIsInPickupGeofence(false);
            setIsInDestinationGeofence(false);
        }
    }, [navigationPhase]);

    // Main geofence checking logic
    useEffect(() => {
        if (!driverLocation) {
            return;
        }

        const checkGeofences = () => {
            // Only check pickup geofence if it should be visible and we're in the right phase
            if (geofenceVisibility.showPickupGeofence && navigationPhase === 'to-pickup') {
                const distanceToPickup = getDistance(driverLocation, pickupLocation);
                const nowInPickupGeofence = distanceToPickup <= GEOFENCE_RADIUS_METERS;

                if (nowInPickupGeofence !== isInPickupGeofence) {
                    setIsInPickupGeofence(nowInPickupGeofence);

                    if (nowInPickupGeofence) {
                        console.log('📍 Entered pickup geofence - Distance:', distanceToPickup, 'meters');
                        stableOnEnterPickup();
                    }
                }
            }

            // Only check destination geofence if it should be visible and we're in the right phase
            if (geofenceVisibility.showDestinationGeofence && navigationPhase === 'to-destination') {
                const distanceToDestination = getDistance(driverLocation, destinationLocation);
                const nowInDestinationGeofence = distanceToDestination <= GEOFENCE_RADIUS_METERS;

                if (nowInDestinationGeofence !== isInDestinationGeofence) {
                    setIsInDestinationGeofence(nowInDestinationGeofence);

                    if (nowInDestinationGeofence) {
                        console.log('📍 Entered destination geofence - Distance:', distanceToDestination, 'meters');
                        stableOnEnterDestination();
                    }
                }
            }
        };

        // Clear existing interval
        if (geofenceCheckInterval.current) {
            clearInterval(geofenceCheckInterval.current);
        }

        // Set up new interval
        geofenceCheckInterval.current = setInterval(checkGeofences, GEOFENCE_CHECK_INTERVAL) as unknown as number;

        // Check immediately
        checkGeofences();

        return () => {
            if (geofenceCheckInterval.current) {
                clearInterval(geofenceCheckInterval.current);
                geofenceCheckInterval.current = null;
            }
        };
    }, [
        driverLocation,
        navigationPhase,
        geofenceVisibility.showPickupGeofence,
        geofenceVisibility.showDestinationGeofence,
        isInPickupGeofence,
        isInDestinationGeofence,
        pickupLocation.latitude,
        pickupLocation.longitude,
        destinationLocation.latitude,
        destinationLocation.longitude,
        stableOnEnterPickup,
        stableOnEnterDestination
    ]);

    // Clear geofence states when they should not be visible
    useEffect(() => {
        if (!geofenceVisibility.showPickupGeofence && isInPickupGeofence) {
            setIsInPickupGeofence(false);
        }
        if (!geofenceVisibility.showDestinationGeofence && isInDestinationGeofence) {
            setIsInDestinationGeofence(false);
        }
    }, [geofenceVisibility.showPickupGeofence, geofenceVisibility.showDestinationGeofence, isInPickupGeofence, isInDestinationGeofence]);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (geofenceCheckInterval.current) {
            clearInterval(geofenceCheckInterval.current);
            geofenceCheckInterval.current = null;
        }
        setIsInPickupGeofence(false);
        setIsInDestinationGeofence(false);
        hasEnteredPickup.current = false;
        hasEnteredDestination.current = false;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    return {
        isInPickupGeofence,
        isInDestinationGeofence,
        geofenceVisibility,
        cleanup
    };
};