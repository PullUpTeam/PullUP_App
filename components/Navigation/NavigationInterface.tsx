// components/Navigation/NavigationInterface.tsx
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Alert } from 'react-native';
import NavigationMapboxMap, { NavigationMapboxMapRef } from '@/components/NavigationMapboxMap';
import {
    EtaCard,
    NavigationInstruction,
    NavigationControls,
} from '@/components/NavigationUIComponents';
import { PassengerInfoCard } from "@/components/Navigation/PassangerInfoCard";
import { PhaseIndicatorBanner } from '@/components/Navigation/PhaseIndicatorBanner';
import { NavigationPhase, RideNavigationData, GEOFENCE_RADIUS_METERS } from '@/hooks/navigation/types';

interface NavigationInterfaceProps {
    rideData: RideNavigationData;
    navigationPhase: NavigationPhase;
    currentPosition: any;
    driverLocation: { latitude: number; longitude: number } | null;
    currentHeading: number;
    navConfig: any;
    routeGeoJSON: any;
    maneuverPoints: Array<{
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
    }>;
    geofenceVisibility: any;
    isNavigating: boolean;
    progress: any;
    currentInstruction: any;
    showInstructions: boolean;
    isMuted: boolean;
    hasHandledDestinationTransition: boolean;
    isLoading: boolean;
    // Event handlers
    calculateETA: () => string;
    formatDuration: (seconds: number) => string;
    formatDistance: (meters: number) => string;
    normalizeManeuverType: (type?: string) => 'turn-left' | 'turn-right' | 'straight' | 'u-turn';
    handleRecenter: () => void;
    handleVolumeToggle: () => void;
    handleBackPress: () => void;
    onGeofenceTransition: (geofenceId: string, visible: boolean) => void;
    getMapboxCameraConfig: () => any;
    isInPickupGeofence: boolean;
    isInDestinationGeofence: boolean;
}

export const NavigationInterface: React.FC<NavigationInterfaceProps> = ({
                                                                            rideData,
                                                                            navigationPhase,
                                                                            currentPosition,
                                                                            driverLocation,
                                                                            currentHeading,
                                                                            navConfig,
                                                                            routeGeoJSON,
                                                                            maneuverPoints,
                                                                            geofenceVisibility,
                                                                            isNavigating,
                                                                            progress,
                                                                            currentInstruction,
                                                                            showInstructions,
                                                                            isMuted,
                                                                            hasHandledDestinationTransition,
                                                                            isLoading,
                                                                            calculateETA,
                                                                            formatDuration,
                                                                            formatDistance,
                                                                            normalizeManeuverType,
                                                                            handleRecenter,
                                                                            handleVolumeToggle,
                                                                            handleBackPress,
                                                                            onGeofenceTransition,
                                                                            getMapboxCameraConfig,
                                                                            isInPickupGeofence,
                                                                            isInDestinationGeofence
                                                                        }) => {
    const mapRef = useRef<NavigationMapboxMapRef>(null);

    // Update map camera when position changes
    useEffect(() => {
        if (currentPosition && mapRef.current) {
            const cameraConfig = getMapboxCameraConfig();
            if (cameraConfig) {
                mapRef.current.flyTo(
                    cameraConfig.centerCoordinate,
                    cameraConfig.zoomLevel,
                    cameraConfig.heading
                );
            }
        }
    }, [currentPosition, currentHeading, getMapboxCameraConfig]);

    const handleRouteOptions = useCallback(() => {
        Alert.alert(
            'Navigation Info',
            `Phase: ${navigationPhase}\nIn Pickup Zone: ${isInPickupGeofence}\nIn Destination Zone: ${isInDestinationGeofence}`,
            [{ text: 'OK' }]
        );
    }, [navigationPhase, isInPickupGeofence, isInDestinationGeofence]);

    return (
        <View className="flex-1">
            {/* Navigation Map with Route, Maneuver Arrows, and Geofences */}
            <NavigationMapboxMap
                ref={mapRef}
                driverLocation={currentPosition || driverLocation}
                pickup={navigationPhase === 'to-pickup' ? {
                    latitude: rideData.pickupLat,
                    longitude: rideData.pickupLng
                } : undefined}
                destination={{
                    latitude: navConfig?.destination.latitude || rideData.destLat,
                    longitude: navConfig?.destination.longitude || rideData.destLng
                }}
                routeGeoJSON={routeGeoJSON}
                maneuverPoints={maneuverPoints}
                geofenceAreas={[
                    {
                        id: 'pickup-geofence',
                        center: [rideData.pickupLng, rideData.pickupLat] as [number, number],
                        radius: GEOFENCE_RADIUS_METERS,
                        color: '#4285F4',
                        opacity: 0.2,
                        type: 'pickup' as const,
                        visible: geofenceVisibility.showPickupGeofence
                    },
                    {
                        id: 'destination-geofence',
                        center: [rideData.destLng, rideData.destLat] as [number, number],
                        radius: GEOFENCE_RADIUS_METERS,
                        color: '#34A853',
                        opacity: 0.2,
                        type: 'destination' as const,
                        visible: geofenceVisibility.showDestinationGeofence
                    }
                ]}
                navigationPhase={navigationPhase}
                onGeofenceTransition={onGeofenceTransition}
                bearing={currentHeading}
                pitch={60}
                zoomLevel={18}
                followMode="course"
                showUserLocation={true}
                enableRotation={false}
                enablePitching={false}
                enableScrolling={true}
                mapStyle="mapbox://styles/mapbox/navigation-day-v1"
            />

            {/* Phase Indicator Banner */}
            <PhaseIndicatorBanner
                navigationPhase={navigationPhase}
                pickupAddress={rideData.pickupAddress}
                destinationAddress={rideData.destAddress}
                onClose={handleBackPress}
            />

            {/* Show message when navigation is skipped */}
            {navigationPhase === 'to-destination' && !isNavigating && !isLoading && hasHandledDestinationTransition && (
                <View className="absolute top-20 left-4 right-4 z-10">
                    <View className="bg-orange-100 border border-orange-300 rounded-lg p-3">
                        <Text className="text-orange-800 text-center font-medium">
                            Turn-by-turn navigation unavailable
                        </Text>
                        <Text className="text-orange-600 text-center text-sm mt-1">
                            Use the map to navigate to: {rideData.destAddress}
                        </Text>
                    </View>
                </View>
            )}

            {/* ETA Card */}
            {isNavigating && (
                <EtaCard
                    arrivalTime={calculateETA()}
                    timeRemaining={formatDuration(progress?.durationRemaining || 0)}
                    distance={formatDistance(progress?.distanceRemaining || 0)}
                    isVisible={isNavigating && progress !== null}
                />
            )}

            {/* Navigation Instructions */}
            {currentInstruction && isNavigating && (
                <NavigationInstruction
                    instruction={currentInstruction.text || currentInstruction.voiceInstruction || 'Continue straight'}
                    distance={formatDistance(currentInstruction.distance || 0)}
                    maneuver={normalizeManeuverType(currentInstruction.maneuver?.type)}
                    isVisible={showInstructions && isNavigating}
                />
            )}

            {/* Passenger Info Card */}
            <PassengerInfoCard
                passengerName={rideData.passengerName}
                estimatedPrice={rideData.estimatedPrice}
                isVisible={navigationPhase === 'to-pickup'}
            />

            {/* Navigation Controls */}
            {isNavigating && (
                <NavigationControls
                    onRecenter={handleRecenter}
                    onVolumeToggle={handleVolumeToggle}
                    onRouteOptions={handleRouteOptions}
                    isMuted={isMuted}
                    isVisible={isNavigating}
                />
            )}
        </View>
    );
};