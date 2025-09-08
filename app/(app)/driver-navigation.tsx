import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, SafeAreaView, Text, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

// Import original hooks that work
import { useOSRMNavigation } from '@/hooks/useOSRMNavigation';
import { usePickupTimer } from '@/hooks/navigation/usePickupTimer';
// import { useEnhancedGeofencing } from '@/hooks/navigation/useEnhancedGeofencing'; // Temporarily disabled to fix infinite re-renders
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
import { DriverConfirmationPanel } from '@/components/DriverConfirmationPanel';

// Types
import { GEOFENCE_RADIUS_METERS, NavigationPhase } from '@/hooks/navigation/types';

export default function GeofencedDriverNavigationScreen() {
    const router = useRouter();
    const rawParams = useLocalSearchParams();
    const mapRef = useRef<NavigationMapboxMapRef>(null);

    // Stabilize params to prevent infinite re-renders
    const params = useMemo(() => {
        // Convert to a stable object with string keys
        const stableParams: Record<string, string> = {};
        Object.entries(rawParams).forEach(([key, value]) => {
            if (typeof value === 'string') {
                stableParams[key] = value;
            } else if (Array.isArray(value)) {
                stableParams[key] = value[0] || '';
            } else {
                stableParams[key] = String(value || '');
            }
        });
        return stableParams;
    }, [rawParams.rideId, rawParams.pickupLat, rawParams.pickupLng, rawParams.destLat, rawParams.destLng, rawParams.pickupAddress, rawParams.destAddress, rawParams.passengerName, rawParams.estimatedPrice]);

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

    // Onchain attestation settings
    const [enableOnchainAttestations, setEnableOnchainAttestations] = useState(false);

    // Navigation phase management (simplified)
    const [navigationPhase, setNavigationPhase] = useState<NavigationPhase>('to-pickup');
    const [isPhaseTransitioning, setIsPhaseTransitioning] = useState(false);

    // Route transition states
    const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
    const [hasHandledDestinationTransition, setHasHandledDestinationTransition] = useState(false);

    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const navigationStartedRef = useRef<{ phase: NavigationPhase | null; started: boolean }>({ phase: null, started: false });

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
                pickupLat: parseFloat(params.pickupLat),
                pickupLng: parseFloat(params.pickupLng),
                pickupAddress: String(params.pickupAddress),
                destLat: parseFloat(params.destLat),
                destLng: parseFloat(params.destLng),
                destAddress: String(params.destAddress),
                passengerName: String(params.passengerName),
                estimatedPrice: String(params.estimatedPrice),
            };
        } catch (error) {
            console.error('❌ Error parsing ride data:', error);
            return null;
        }
    }, [
        params.rideId,
        params.pickupLat,
        params.pickupLng,
        params.destLat,
        params.destLng,
        params.pickupAddress,
        params.destAddress,
        params.passengerName,
        params.estimatedPrice
    ]);

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

    // Simplified geofencing state for now to avoid infinite re-renders
    const [isInPickupGeofence, setIsInPickupGeofence] = useState(false);
    const [isInDestinationGeofence, setIsInDestinationGeofence] = useState(false);
    
    // Simple geofence visibility
    const geofenceVisibility = useMemo(() => {
        switch (navigationPhase) {
            case 'to-pickup':
            case 'at-pickup':
                return { showPickupGeofence: true, showDestinationGeofence: false };
            case 'to-destination':
            case 'at-destination':
                return { showPickupGeofence: false, showDestinationGeofence: true };
            default:
                return { showPickupGeofence: false, showDestinationGeofence: false };
        }
    }, [navigationPhase]);

    // Simple geofencing logic to trigger phase transitions
    useEffect(() => {
        if (!driverLocation) return;

        const checkGeofences = () => {
            // Check pickup geofence
            if (navigationPhase === 'to-pickup') {
                const distanceToPickup = Math.sqrt(
                    Math.pow((driverLocation.latitude - rideData.pickupLat) * 111000, 2) +
                    Math.pow((driverLocation.longitude - rideData.pickupLng) * 111000 * Math.cos(driverLocation.latitude * Math.PI / 180), 2)
                );
                
                const inPickupGeofence = distanceToPickup <= GEOFENCE_RADIUS_METERS;
                
                if (inPickupGeofence && !isInPickupGeofence) {
                    console.log('🎯 Entered pickup geofence - transitioning to at-pickup');
                    setIsInPickupGeofence(true);
                    transitionToPhase('at-pickup').then(() => {
                        startTimer();
                    });
                } else if (!inPickupGeofence && isInPickupGeofence) {
                    setIsInPickupGeofence(false);
                }
            }

            // Check destination geofence
            if (navigationPhase === 'to-destination') {
                const distanceToDestination = Math.sqrt(
                    Math.pow((driverLocation.latitude - rideData.destLat) * 111000, 2) +
                    Math.pow((driverLocation.longitude - rideData.destLng) * 111000 * Math.cos(driverLocation.latitude * Math.PI / 180), 2)
                );
                
                const inDestinationGeofence = distanceToDestination <= GEOFENCE_RADIUS_METERS;
                
                if (inDestinationGeofence && !isInDestinationGeofence) {
                    console.log('🎯 Entered destination geofence - transitioning to at-destination');
                    setIsInDestinationGeofence(true);
                    transitionToPhase('at-destination');
                } else if (!inDestinationGeofence && isInDestinationGeofence) {
                    setIsInDestinationGeofence(false);
                }
            }
        };

        const interval = setInterval(checkGeofences, 2000); // Check every 2 seconds
        checkGeofences(); // Check immediately

        return () => clearInterval(interval);
    }, [driverLocation, navigationPhase, isInPickupGeofence, isInDestinationGeofence, rideData.pickupLat, rideData.pickupLng, rideData.destLat, rideData.destLng, transitionToPhase, startTimer]);

    // Placeholder values for removed geofencing functionality
    const geofenceState = {
        pickup: { attestation: null, isWaitingForConfirmation: false, hasConfirmed: false, timeRemaining: 0 },
        destination: { attestation: null, isWaitingForConfirmation: false, hasConfirmed: false, timeRemaining: 0 }
    };
    const triggerManualConfirmation = useCallback(() => {}, []);
    const cancelConfirmation = useCallback(() => {}, []);
    const isCreatingAttestation = false;
    const attestationError = null;
    const isWalletConnected = false;
    const cleanupGeofencing = useCallback(() => {}, []);

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
        // Check if we should start navigation and haven't already started for this phase
        const shouldStart = (navigationPhase === 'to-pickup' || navigationPhase === 'to-destination') &&
            !isNavigating &&
            !isLoading &&
            !error &&
            navConfig &&
            !isPhaseTransitioning &&
            !isRouteTransitioning &&
            driverLocation &&
            !locationLoading;

        const hasStartedForCurrentPhase = navigationStartedRef.current.phase === navigationPhase && navigationStartedRef.current.started;

        if (shouldStart && !hasStartedForCurrentPhase) {
            const isPickupPhase = navigationPhase === 'to-pickup';
            const destinationName = isPickupPhase ? rideData.pickupAddress : rideData.destAddress;

            console.log(`🚀 Auto-starting ${isPickupPhase ? 'pickup' : 'destination'} navigation`);
            
            // Mark as started for this phase
            navigationStartedRef.current = { phase: navigationPhase, started: true };

            startNavigation().then(() => {
                setTimeout(() => {
                    const message = isPickupPhase
                        ? `Starting navigation to pickup location at ${destinationName}`
                        : `Starting navigation to destination at ${destinationName}`;
                    speakInstruction(message);
                }, 1000);
            }).catch(err => {
                console.error('❌ Auto-start failed:', err);
                // Reset on failure so it can retry
                navigationStartedRef.current = { phase: null, started: false };
            });
        }
    }, [
        navigationPhase,
        isNavigating,
        isLoading,
        error,
        isPhaseTransitioning,
        isRouteTransitioning,
        !!navConfig,
        !!driverLocation,
        locationLoading,
        rideData.pickupAddress,
        rideData.destAddress
    ]);

    // Reset navigation started ref when phase changes
    useEffect(() => {
        if (navigationStartedRef.current.phase !== navigationPhase) {
            navigationStartedRef.current = { phase: null, started: false };
        }
    }, [navigationPhase]);

    // Event handlers
    const handlePassengerPickup = useCallback(async () => {
        stopTimer();
        console.log('🚗 Passenger picked up - starting navigation to destination');

        if (navigationPhase !== 'at-pickup') {
            Alert.alert('Phase Error', `Cannot pickup from phase: ${navigationPhase}`);
            return;
        }

        try {
            // Clear current navigation state
            stopNavigation();
            clearRoute();
            
            // Reset navigation tracking
            navigationStartedRef.current = { phase: null, started: false };
            setIsRouteTransitioning(false);
            setHasHandledDestinationTransition(false);

            // Transition directly to destination navigation
            const result = await transitionToPhase('to-destination');
            if (!result.success) {
                Alert.alert('Error', 'Failed to start destination navigation');
                return;
            }

            // Give a brief moment for the phase to update, then the auto-start effect will handle navigation
            console.log('✅ Passenger picked up successfully - navigating to destination');
            speakInstruction(`Passenger picked up. Starting navigation to ${rideData.destAddress}`);

        } catch (error) {
            console.error('❌ Pickup failed:', error);
            Alert.alert('Error', 'Failed to start destination navigation');
        }
    }, [stopTimer, navigationPhase, transitionToPhase, stopNavigation, clearRoute, speakInstruction, rideData.destAddress]);

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

    // Removed picking-up phase - now goes directly from at-pickup to to-destination

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

            {/* Debug button to test pickup screen - remove in production */}
            {navigationPhase === 'to-pickup' && (
                <View className="absolute top-16 right-4 z-20">
                    <TouchableOpacity
                        onPress={() => {
                            console.log('🧪 Debug: Manually triggering pickup phase');
                            transitionToPhase('at-pickup').then(() => {
                                startTimer();
                            });
                        }}
                        className="bg-blue-600 px-3 py-2 rounded-md"
                    >
                        <Text className="text-white text-sm font-medium">Test Pickup</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Debug button to test destination screen - remove in production */}
            {navigationPhase === 'to-destination' && (
                <View className="absolute top-16 right-4 z-20">
                    <TouchableOpacity
                        onPress={() => {
                            console.log('🧪 Debug: Manually triggering destination phase');
                            transitionToPhase('at-destination');
                        }}
                        className="bg-green-600 px-3 py-2 rounded-md"
                    >
                        <Text className="text-white text-sm font-medium">Test Arrival</Text>
                    </TouchableOpacity>
                </View>
            )}

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

            {/* Driver Confirmation Panel - Show when in geofence zones */}
            {(isInPickupGeofence || isInDestinationGeofence ||
                geofenceState.pickup.isWaitingForConfirmation ||
                geofenceState.destination.isWaitingForConfirmation) && (
                    <View className="absolute bottom-0 left-0 right-0 z-20">
                        <DriverConfirmationPanel
                            geofenceState={geofenceState}
                            navigationPhase={navigationPhase}
                            isCreatingAttestation={isCreatingAttestation}
                            attestationError={attestationError}
                            isWalletConnected={isWalletConnected}
                            enableOnchainAttestations={enableOnchainAttestations}
                            onToggleAttestations={setEnableOnchainAttestations}
                            onTriggerManualConfirmation={triggerManualConfirmation}
                            onCancelConfirmation={cancelConfirmation}
                        />
                    </View>
                )}
        </View>
    );
}