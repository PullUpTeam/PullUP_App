import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, SafeAreaView, Text, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

// Import original hooks that work
import { useOSRMNavigation } from '@/hooks/useOSRMNavigation';
import { usePickupTimer } from '@/hooks/navigation/usePickupTimer';
import { useGeofencing } from '@/hooks/navigation/useGeofencing';
import { useVoiceGuidance } from '@/hooks/navigation/useVoiceGuidance';

// Import components
import NavigationMapboxMap, { NavigationMapboxMapRef } from '@/components/NavigationMapboxMap';
import {
    EtaCard,
    NavigationInstruction,
    NavigationControls,
} from '@/components/NavigationUIComponents';
import { LoadingScreen } from '@/components/Navigation/LoadingScreen';
import { PickupWaitingScreen } from '@/components/Navigation/PickupWaitingScreen';
import { ErrorScreen } from '@/components/Navigation/ErrorScreen';
import { DestinationArrivalScreen } from '@/components/Navigation/DestinationArrivalScreen';
import { PassengerInfoCard } from "@/components/Navigation/PassangerInfoCard";
import { PhaseIndicatorBanner } from '@/components/Navigation/PhaseIndicatorBanner';

// Types
import { GEOFENCE_RADIUS_METERS, NavigationPhase } from '@/hooks/navigation/types';

export default function GeofencedDriverNavigationScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const mapRef = useRef<NavigationMapboxMapRef>(null);

    console.log('🚗 Navigation Screen starting with params:', Object.keys(params));

    // Basic state
    const [isMuted, setIsMuted] = useState(false);
    const [driverLocation, setDriverLocation] = useState<{
        latitude: number;
        longitude: number;
    } | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);
    const [maneuverPoints, setManeuverPoints] = useState<Array<{
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
    }>>([]);

    // Navigation phase management (simplified)
    const [navigationPhase, setNavigationPhase] = useState<NavigationPhase>('to-pickup');
    const [isPhaseTransitioning, setIsPhaseTransitioning] = useState(false);

    // Route transition states
    const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
    const [hasHandledDestinationTransition, setHasHandledDestinationTransition] = useState(false);

    const locationSubscription = useRef<Location.LocationSubscription | null>(null);

    // Validate ride data (memoized to prevent recalculation)
    const rideData = useMemo(() => {
        if (!params || typeof params !== 'object') {
            console.error('❌ Invalid params');
            return null;
        }

        const requiredFields = [
            'rideId', 'pickupLat', 'pickupLng', 'destLat', 'destLng',
            'pickupAddress', 'destAddress', 'passengerName', 'estimatedPrice'
        ];

        for (const field of requiredFields) {
            if (!(field in params)) {
                console.error(`❌ Missing field: ${field}`);
                return null;
            }
        }

        try {
            return {
                id: String(params.rideId),
                pickupLat: parseFloat(params.pickupLat as string),
                pickupLng: parseFloat(params.pickupLng as string),
                pickupAddress: String(params.pickupAddress),
                destLat: parseFloat(params.destLat as string),
                destLng: parseFloat(params.destLng as string),
                destAddress: String(params.destAddress),
                passengerName: String(params.passengerName),
                estimatedPrice: String(params.estimatedPrice),
            };
        } catch (error) {
            console.error('❌ Error parsing ride data:', error);
            return null;
        }
    }, [params]);

    // Early return if no valid ride data
    if (!rideData) {
        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <ErrorScreen
                    title="Invalid Navigation Data"
                    message="The ride information is missing or invalid. Please try again."
                    onGoBack={() => router.replace('/(app)')}
                />
            </SafeAreaView>
        );
    }

    // Location setup (simplified)
    useEffect(() => {
        let isMounted = true;

        const initLocation = async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    if (isMounted) {
                        Alert.alert(
                            'Permission Denied',
                            'Location permission required',
                            [{ text: 'OK', onPress: () => router.back() }]
                        );
                    }
                    return;
                }

                const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High
                });

                if (isMounted) {
                    setDriverLocation({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude
                    });
                    setLocationLoading(false);
                    console.log('📍 Driver location set');
                }

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
                console.error('❌ Location error:', error);
                if (isMounted) {
                    setLocationLoading(false);
                }
            }
        };

        initLocation();

        return () => {
            isMounted = false;
            if (locationSubscription.current) {
                locationSubscription.current.remove();
            }
        };
    }, [router]);

    // Navigation config (simplified)
    const navConfig = useMemo(() => {
        if (navigationPhase === 'to-pickup' && driverLocation) {
            return {
                origin: {
                    latitude: driverLocation.latitude,
                    longitude: driverLocation.longitude
                },
                destination: {
                    latitude: rideData.pickupLat,
                    longitude: rideData.pickupLng
                },
                destinationName: rideData.pickupAddress,
                phaseMessage: 'Navigating to pickup location'
            };
        }

        if (navigationPhase === 'to-destination') {
            return {
                origin: {
                    latitude: rideData.pickupLat,
                    longitude: rideData.pickupLng
                },
                destination: {
                    latitude: rideData.destLat,
                    longitude: rideData.destLng
                },
                destinationName: rideData.destAddress,
                phaseMessage: 'Navigating to destination'
            };
        }

        return null;
    }, [navigationPhase, driverLocation, rideData.pickupLat, rideData.pickupLng, rideData.pickupAddress, rideData.destLat, rideData.destLng, rideData.destAddress]);

    // Hooks
    const { pickupTimer, startTimer, stopTimer, formatTimer } = usePickupTimer();
    const { speakInstruction } = useVoiceGuidance(isMuted);

    // Navigation hook with stable config
    const {
        isNavigating,
        isLoading,
        route,
        currentPosition,
        currentHeading,
        progress,
        currentInstruction,
        error,
        startNavigation,
        stopNavigation,
        retryNavigation,
        clearRoute,
        restartNavigation,
        getRouteGeoJSON,

        formatDistance,
        formatDuration,
    } = useOSRMNavigation({
        origin: navConfig?.origin || { latitude: 0, longitude: 0 },
        destination: navConfig?.destination || { latitude: 0, longitude: 0 },
        enabled: !!navConfig && !!driverLocation && !locationLoading &&
            (navigationPhase === 'to-pickup' || navigationPhase === 'to-destination') &&
            !isPhaseTransitioning,
        onDestinationReached: () => {
            console.log('Navigation destination reached');
        },
        onNavigationError: useCallback((error: Error) => {
            console.error('🚨 Navigation error:', error);
            setIsRouteTransitioning(false);
        }, []),
        onNewInstruction: useCallback((instruction: any) => {
            console.log('🗣️ New instruction:', instruction.voiceInstruction);
            speakInstruction(instruction.voiceInstruction);
        }, [speakInstruction])
    });

    // Simple phase transition function
    const transitionToPhase = useCallback(async (newPhase: NavigationPhase) => {
        console.log(`🔄 Phase transition: ${navigationPhase} -> ${newPhase}`);
        setIsPhaseTransitioning(true);

        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            setNavigationPhase(newPhase);
            setIsPhaseTransitioning(false);
            return { success: true, fromPhase: navigationPhase, toPhase: newPhase };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setIsPhaseTransitioning(false);
            return { success: false, error: errorMessage, fromPhase: navigationPhase, toPhase: newPhase };
        }
    }, [navigationPhase]);

    // Locations for geofencing
    const pickupLocation = useMemo(() => ({
        latitude: rideData.pickupLat,
        longitude: rideData.pickupLng
    }), [rideData.pickupLat, rideData.pickupLng]);

    const destinationLocation = useMemo(() => ({
        latitude: rideData.destLat,
        longitude: rideData.destLng
    }), [rideData.destLat, rideData.destLng]);

    // Geofence callbacks
    const onEnterPickupGeofence = useCallback(async () => {
        console.log('🎯 Entered pickup geofence');
        await transitionToPhase('at-pickup');
        startTimer();
    }, [transitionToPhase, startTimer]);

    const onEnterDestinationGeofence = useCallback(async () => {
        console.log('🎯 Entered destination geofence');
        await transitionToPhase('at-destination');
    }, [transitionToPhase]);

    // Geofencing
    const { isInPickupGeofence, isInDestinationGeofence, geofenceVisibility, cleanup: cleanupGeofencing } = useGeofencing({
        driverLocation,
        pickupLocation,
        destinationLocation,
        navigationPhase,
        onEnterPickupGeofence,
        onEnterDestinationGeofence
    });

    // Extract maneuver points
    useEffect(() => {
        if (route && route.instructions) {
            const points = route.instructions
                .filter(inst => inst.maneuver && inst.maneuver.location)
                .map(inst => ({
                    coordinate: [inst.maneuver.location.longitude, inst.maneuver.location.latitude] as [number, number],
                    type: inst.maneuver.type,
                    modifier: inst.maneuver.modifier,
                    instruction: inst.text
                }));
            setManeuverPoints(points);
        }
    }, [route]);

    // Auto-start navigation for both pickup and destination phases
    useEffect(() => {
        // Auto-start navigation for both pickup and destination phases
        if ((navigationPhase === 'to-pickup' || navigationPhase === 'to-destination') &&
            !isNavigating &&
            !isLoading &&
            !error &&
            navConfig &&
            !isPhaseTransitioning &&
            !isRouteTransitioning &&
            driverLocation &&
            !locationLoading) {

            const isPickupPhase = navigationPhase === 'to-pickup';
            const destinationName = isPickupPhase ? rideData.pickupAddress : rideData.destAddress;
            
            console.log(`🚀 Auto-starting ${isPickupPhase ? 'pickup' : 'destination'} navigation`);
            
            startNavigation().then(() => {
                setTimeout(() => {
                    const message = isPickupPhase 
                        ? `Starting navigation to pickup location at ${destinationName}`
                        : `Starting navigation to destination at ${destinationName}`;
                    speakInstruction(message);
                }, 1000);
            }).catch(err => {
                console.error('❌ Auto-start failed:', err);
            });
        }
    }, [
        navigationPhase,
        isNavigating,
        isLoading,
        error,
        isPhaseTransitioning,
        isRouteTransitioning,
        navConfig,
        driverLocation,
        locationLoading,
        startNavigation,
        speakInstruction,
        rideData.pickupAddress,
        rideData.destAddress
    ]);

    // Event handlers
    const handlePassengerPickup = useCallback(async () => {
        stopTimer();
        console.log('🚗 Starting passenger pickup');

        if (navigationPhase !== 'at-pickup') {
            Alert.alert('Phase Error', `Cannot pickup from phase: ${navigationPhase}`);
            return;
        }

        try {
            // Transition to picking-up
            const pickupResult = await transitionToPhase('picking-up');
            if (!pickupResult.success) {
                Alert.alert('Error', 'Failed to start pickup process');
                return;
            }

            // Clear navigation state
            stopNavigation();
            clearRoute();
            setIsRouteTransitioning(false);
            setHasHandledDestinationTransition(false);

            // Wait then transition to destination
            setTimeout(async () => {
                try {
                    const result = await transitionToPhase('to-destination');
                    if (!result.success) {
                        Alert.alert('Error', 'Failed to start destination navigation');
                        return;
                    }

                    // Clear route and let auto-start handle destination navigation
                    setTimeout(() => {
                        console.log('🧹 Clearing route for destination phase');
                        clearRoute();
                        setIsRouteTransitioning(false);
                        setHasHandledDestinationTransition(true);
                    }, 500);

                } catch (error) {
                    console.error('❌ Destination transition failed:', error);
                    Alert.alert('Error', 'Failed to start destination navigation');
                }
            }, 2000);

        } catch (error) {
            console.error('❌ Pickup failed:', error);
            Alert.alert('Error', 'Failed to start pickup process');
        }
    }, [stopTimer, navigationPhase, transitionToPhase, stopNavigation, clearRoute, restartNavigation, speakInstruction, rideData.pickupLat, rideData.pickupLng, rideData.destLat, rideData.destLng, rideData.destAddress]);

    const handleTripComplete = useCallback(async () => {
        try {
            await transitionToPhase('completed');
            Alert.alert(
                'Trip Completed! 🎉',
                `Successfully dropped off ${rideData.passengerName}`,
                [{ text: 'Complete & Rate', onPress: () => router.replace('/(app)') }]
            );
        } catch (error) {
            console.error('❌ Trip complete failed:', error);
            router.replace('/(app)');
        }
    }, [transitionToPhase, rideData, router]);

    const handleBackPress = useCallback(() => {
        Alert.alert(
            'Cancel Navigation',
            'Are you sure you want to cancel this trip?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        stopNavigation();
                        await Speech.stop();
                        router.back();
                    }
                }
            ]
        );
    }, [stopNavigation, router]);

    const handleRecenter = useCallback(() => {
        if (currentPosition && mapRef.current) {
            mapRef.current.flyTo(
                [currentPosition.longitude, currentPosition.latitude],
                18,
                currentHeading
            );
        }
    }, [currentPosition, currentHeading]);

    const handleVolumeToggle = useCallback(() => {
        setIsMuted(!isMuted);
        if (isMuted) {
            speakInstruction('Voice guidance enabled');
        }
    }, [isMuted, speakInstruction]);

    const calculateETA = useCallback(() => {
        if (!progress?.durationRemaining) return '-- --';
        try {
            const now = new Date();
            const eta = new Date(now.getTime() + progress.durationRemaining * 1000);
            return eta.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return '-- --';
        }
    }, [progress?.durationRemaining]);

    const normalizeManeuverType = useCallback((maneuverType?: string): 'turn-left' | 'turn-right' | 'straight' | 'u-turn' => {
        if (!maneuverType) return 'straight';
        const normalized = maneuverType.toLowerCase();
        if (normalized.includes('left')) return 'turn-left';
        if (normalized.includes('right')) return 'turn-right';
        if (normalized.includes('u-turn')) return 'u-turn';
        return 'straight';
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            console.log('🧹 Cleaning up navigation');
            Speech.stop();
            cleanupGeofencing();
        };
    }, [cleanupGeofencing]);

    // Show loading state
    if (locationLoading || (isLoading && !route) || isRouteTransitioning) {
        let title = locationLoading ? 'Getting Your Location...' : 'Starting Navigation...';
        let subtitle = locationLoading ? 'Please wait' : `Calculating route to ${navConfig?.destinationName}`;

        if (isRouteTransitioning && navigationPhase === 'to-destination') {
            title = 'Starting Trip to Destination';
            subtitle = 'Calculating route to drop-off location...';
        }

        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <LoadingScreen title={title} subtitle={subtitle} />
            </SafeAreaView>
        );
    }

    // Show error state
    if (error && !route) {
        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <ErrorScreen
                    title="Navigation Error"
                    message={error.message}
                    onRetry={retryNavigation}
                    onGoBack={() => router.back()}
                />
            </SafeAreaView>
        );
    }

    // Show pickup waiting screen
    if (navigationPhase === 'at-pickup') {
        return (
            <SafeAreaView className="flex-1 bg-blue-500">
                <Stack.Screen options={{ headerShown: false }} />
                <PickupWaitingScreen
                    mapRef={mapRef}
                    rideData={rideData}
                    currentPosition={currentPosition}
                    driverLocation={driverLocation}
                    currentHeading={currentHeading}
                    pickupTimer={pickupTimer}
                    formatTimer={formatTimer}
                    onPassengerPickup={handlePassengerPickup}
                    onBackPress={handleBackPress}
                />
            </SafeAreaView>
        );
    }

    // Show picking up screen
    if (navigationPhase === 'picking-up') {
        return (
            <SafeAreaView className="flex-1 bg-green-600">
                <Stack.Screen options={{ headerShown: false }} />
                <LoadingScreen
                    title="Starting Trip"
                    subtitle={`Navigating to ${rideData.destAddress}`}
                    color="#34A853"
                />
            </SafeAreaView>
        );
    }

    // Show arrival screen
    if (navigationPhase === 'at-destination') {
        return (
            <SafeAreaView className="flex-1 bg-green-600">
                <Stack.Screen options={{ headerShown: false }} />
                <DestinationArrivalScreen
                    mapRef={mapRef}
                    rideData={rideData}
                    currentPosition={currentPosition}
                    driverLocation={driverLocation}
                    currentHeading={currentHeading}
                    onTripComplete={handleTripComplete}
                />
            </SafeAreaView>
        );
    }

    // Get route for display
    const routeGeoJSON = getRouteGeoJSON();

    // Main navigation view
    return (
        <View className="flex-1">
            <Stack.Screen options={{ headerShown: false }} />

            {/* Navigation Map */}
            <NavigationMapboxMap
                ref={mapRef}
                driverLocation={currentPosition || driverLocation}
                pickup={navigationPhase === 'to-pickup' ? pickupLocation : undefined}
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
                onGeofenceTransition={(geofenceId, visible) => {
                    console.log(`🔄 Geofence: ${geofenceId} -> ${visible}`);
                }}
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

            {/* Phase Indicator */}
            <PhaseIndicatorBanner
                navigationPhase={navigationPhase}
                pickupAddress={rideData.pickupAddress}
                destinationAddress={rideData.destAddress}
                onClose={handleBackPress}
            />

            {/* Navigation unavailable message - only show if navigation failed to start */}
            {navigationPhase === 'to-destination' && !isNavigating && !isLoading && error && hasHandledDestinationTransition && (
                <View className="absolute top-20 left-4 right-4 z-10">
                    <View className="bg-orange-100 border border-orange-300 rounded-lg p-3">
                        <Text className="text-orange-800 text-center font-medium">
                            Turn-by-turn navigation unavailable
                        </Text>
                        <Text className="text-orange-600 text-center text-sm mt-1">
                            Use the map to navigate to: {rideData.destAddress}
                        </Text>
                        <TouchableOpacity 
                            onPress={retryNavigation}
                            className="mt-2 bg-orange-600 px-4 py-2 rounded-md"
                        >
                            <Text className="text-white text-center font-medium">Retry Navigation</Text>
                        </TouchableOpacity>
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
                    isVisible={isNavigating}
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
                    onRouteOptions={() => {
                        Alert.alert(
                            'Navigation Info',
                            `Phase: ${navigationPhase}\nPickup Zone: ${isInPickupGeofence}\nDestination Zone: ${isInDestinationGeofence}`,
                            [{ text: 'OK' }]
                        );
                    }}
                    isMuted={isMuted}
                    isVisible={isNavigating}
                />
            )}
        </View>
    );
}