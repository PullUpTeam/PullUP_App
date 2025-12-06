import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';

// Custom hooks
import { useTripState } from '@/hooks/useTripState';
import { useRealTimeDriverTracking } from '@/hooks/useRealTimeDriverTracking';
import { useRideStatus } from '@/hooks/useRideStatus';
import { useTripPhaseManager } from '@/hooks/useTripPhaseManager';
import { useLocation } from '@/hooks/Location/useLocation';

// Components
import { TripMap, TripInfo } from '@/components/trip';

const TripScreen = () => {
    const mapRef = useRef<Mapbox.MapView>(null);

    // Main trip state
    const {
        tripParams,
        userPickupCoords,
        setUserPickupCoords,
    } = useTripState();

    // Get user's current location for fallback
    const { location: currentUserLocation } = useLocation({ autoStart: true });

    // Get ride status and assigned driver information
    const rideId = tripParams.rideId || 'mock-ride-id';
    const {
        ride,
        assignedDriver,
        rideStatus,
        isWaitingForDriver,
        isDriverAssigned,
        isLoading: isLoadingRide,
        error: rideError,
    } = useRideStatus({
        rideId,
        enabled: true,
    });

    // Use coordinates directly from ride data (no geocoding needed)
    const passengerPickupLocation = ride?.originCoordinates ? {
        latitude: ride.originCoordinates.latitude,
        longitude: ride.originCoordinates.longitude,
    } : null;

    // Set userPickupCoords from ride data for backward compatibility with map component
    useEffect(() => {
        if (ride?.originCoordinates) {
            const rideCoords: [number, number] = [ride.originCoordinates.longitude, ride.originCoordinates.latitude];
            setUserPickupCoords(rideCoords);
        }
    }, [ride?.originCoordinates, setUserPickupCoords]);

    const passengerDestinationLocation = ride?.destinationCoordinates ? {
        latitude: ride.destinationCoordinates.latitude,
        longitude: ride.destinationCoordinates.longitude,
    } : null;

    // Initial trip phase management (will be updated with real data)
    const initialPhaseManager = useTripPhaseManager({
        ride,
        driverLocation: null,
        passengerPickupLocation,
        passengerDestinationLocation,
        distance: null,
        enabled: true,
    });

    // Real-time driver tracking with phase-aware target location
    const {
        driverLocation,
        distance,
        formattedDistance,
        eta,
        formattedEta,
        routeGeometry,
        isLoading: isLoadingDistance,
        error: distanceError,
        lastUpdated,
        retry: retryDistance,
    } = useRealTimeDriverTracking({
        rideId,
        driverId: assignedDriver?.id || null,
        passengerLocation: passengerPickupLocation || { latitude: 0, longitude: 0 },
        targetLocation: initialPhaseManager.targetLocation,
        enabled: initialPhaseManager.shouldCalculateDistance && isDriverAssigned && !!passengerPickupLocation,
    });

    // Updated trip phase management with real driver location and distance
    const {
        currentPhase,
        phaseInfo,
        targetLocation,
        shouldCalculateDistance,
        shouldShowETA,
        distanceLabel,
        etaLabel,
        statusMessage,
    } = useTripPhaseManager({
        ride,
        driverLocation,
        passengerPickupLocation,
        passengerDestinationLocation,
        distance,
        enabled: true,
    });

    // Convert driver location to coordinate array format for map display
    const driverCoords: [number, number] | null = driverLocation ?
        [driverLocation.longitude, driverLocation.latitude] : null;

    // Calculate initial map region
    const initialMapRegion = passengerPickupLocation ? {
        latitude: passengerPickupLocation.latitude,
        longitude: passengerPickupLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.01,
    } : driverLocation ? {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    } : currentUserLocation?.coords ? {
        latitude: currentUserLocation.coords.latitude,
        longitude: currentUserLocation.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.01,
    } : {
        latitude: 37.7749, // Default to San Francisco
        longitude: -122.4194,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    };

    // Use phase info for display
    const displayStatus = phaseInfo.title;

    return (
        <SafeAreaView className="flex-1 bg-white">
            <Stack.Screen options={{ title: displayStatus }} />

            <View className="flex-[0.7]">
                <TripMap
                    mapRef={mapRef}
                    initialRegion={initialMapRegion}
                    driverCoords={driverCoords}
                    userPickupCoords={userPickupCoords}
                    routeToPickupGeoJSON={routeGeometry}
                />
            </View>

            <TripInfo
                tripStatus={displayStatus}
                driverName={assignedDriver?.username || tripParams.driverName}
                driverVehicle={tripParams.driverVehicle} // Keep using the vehicle from params for now
                pickupAddress={tripParams.pickupAddress}
                price={tripParams.price}
                isLoadingRoute={isLoadingRide || isLoadingDistance}
                distance={distance}
                formattedDistance={formattedDistance}
                eta={eta}
                formattedEta={formattedEta}
                isLoadingDistance={isLoadingDistance}
                distanceError={distanceError || rideError}
                lastUpdated={lastUpdated}
                onRetryDistance={retryDistance}
                // New phase-aware props
                currentPhase={currentPhase}
                phaseInfo={phaseInfo}
                shouldShowETA={shouldShowETA}
                distanceLabel={distanceLabel}
                etaLabel={etaLabel}
                statusMessage={statusMessage}
            />
        </SafeAreaView>
    );
};

export default TripScreen;