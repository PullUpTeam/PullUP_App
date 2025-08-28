import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Alert, SafeAreaView, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { useOSRMNavigation } from '@/hooks/useOSRMNavigation';
import NavigationMapboxMap, { NavigationMapboxMapRef } from '@/components/NavigationMapboxMap';
import {
    EtaCard,
    NavigationInstruction,
    NavigationControls,
} from '@/components/NavigationUIComponents';
import { usePickupTimer } from '@/hooks/navigation/usePickupTimer';
import { useGeofencing } from '@/hooks/navigation/useGeofencing';
import { useVoiceGuidance } from '@/hooks/navigation/useVoiceGuidance';
import { RideNavigationData, GEOFENCE_RADIUS_METERS, NavigationPhase } from '@/hooks/navigation/types';
import { LoadingScreen } from '@/components/Navigation/LoadingScreen';
import { PickupWaitingScreen } from '@/components/Navigation/PickupWaitingScreen';
import { ErrorScreen } from '@/components/Navigation/ErrorScreen';
import { DestinationArrivalScreen } from '@/components/Navigation/DestinationArrivalScreen';
import { PassengerInfoCard } from "@/components/Navigation/PassangerInfoCard";
import { PhaseIndicatorBanner } from '@/components/Navigation/PhaseIndicatorBanner';

export default function GeofencedDriverNavigationScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const mapRef = useRef<NavigationMapboxMapRef>(null);

    // State
    const [isMuted, setIsMuted] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [driverLocation, setDriverLocation] = useState<{
        latitude: number;
        longitude: number;
    } | null>(null);
    const [locationLoading, setLocationLoading] = useState(true);
    const locationSubscription = useRef<Location.LocationSubscription | null>(null);
    const [maneuverPoints, setManeuverPoints] = useState<Array<{
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
    }>>([]);
    const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
    const retryNavigationRef = useRef<(() => void) | null>(null);

    console.log('🚗 Geofenced Driver Navigation Screen loaded with params:', params);

    // Memoized ride data validation to prevent recalculation on every render
    const rideData = useMemo(() => {
        const validateParams = (params: any): RideNavigationData | null => {
            if (!params || typeof params !== 'object') {
                console.error('❌ Params is not an object:', params);
                return null;
            }

            const requiredFields = [
                'rideId', 'pickupLat', 'pickupLng', 'destLat', 'destLng',
                'pickupAddress', 'destAddress', 'passengerName', 'estimatedPrice'
            ];

            for (const field of requiredFields) {
                if (!(field in params) || params[field] === undefined || params[field] === null) {
                    console.error(`❌ Missing required field: ${field}`, params);
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
                console.error('❌ Error creating ride data:', error);
                return null;
            }
        };

        return validateParams(params);
    }, [params]);

    // Memoized utility function to prevent recreation on every render
    const normalizeManeuverType = useCallback((maneuverType?: string): 'turn-left' | 'turn-right' | 'straight' | 'u-turn' => {
        if (!maneuverType) return 'straight';
        const normalized = maneuverType.toLowerCase();
        if (normalized.includes('left')) return 'turn-left';
        if (normalized.includes('right')) return 'turn-right';
        if (normalized.includes('u-turn') || normalized.includes('uturn')) return 'u-turn';
        return 'straight';
    }, []);

    // Custom hooks
    const { pickupTimer, startTimer, stopTimer, formatTimer } = usePickupTimer();
    const { speakInstruction } = useVoiceGuidance(isMuted);

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

    // Memoized locations to prevent object recreation
    const pickupLocation = useMemo(() => ({
        latitude: rideData.pickupLat,
        longitude: rideData.pickupLng
    }), [rideData.pickupLat, rideData.pickupLng]);

    const destinationLocation = useMemo(() => ({
        latitude: rideData.destLat,
        longitude: rideData.destLng
    }), [rideData.destLat, rideData.destLng]);

    // Initialize navigation phase state - MOVED BEFORE navConfig to fix variable declaration order
    const [navigationPhase, setNavigationPhase] = useState<NavigationPhase>('to-pickup');
    const [isPhaseTransitioning, setIsPhaseTransitioning] = useState(false);
    const [phaseTransitionError, setPhaseTransitionError] = useState<string | null>(null);
    const [transitionProgress, setTransitionProgress] = useState(0);

    // Simple phase transition function
    const transitionToPhase = useCallback(async (newPhase: NavigationPhase) => {
        console.log(`🔄 Transitioning from ${navigationPhase} to ${newPhase}`);
        setIsPhaseTransitioning(true);
        setPhaseTransitionError(null);

        try {
            // Add a small delay to simulate transition
            await new Promise(resolve => setTimeout(resolve, 100));
            setNavigationPhase(newPhase);
            setIsPhaseTransitioning(false);
            return { success: true, fromPhase: navigationPhase, toPhase: newPhase };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setPhaseTransitionError(errorMessage);
            setIsPhaseTransitioning(false);
            return { success: false, error: errorMessage, fromPhase: navigationPhase, toPhase: newPhase };
        }
    }, [navigationPhase]);

    const clearPhaseError = useCallback(() => {
        setPhaseTransitionError(null);
    }, []);

    const cleanupPhaseManager = useCallback(() => {
        console.log('🧹 Cleaning up phase manager');
    }, []);

    // Memoized navigation configuration to prevent recalculation
    const navConfig = useMemo(() => {
        if (((navigationPhase as NavigationPhase) === 'to-pickup' || (navigationPhase as NavigationPhase) === 'at-pickup') && driverLocation) {
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
        } else if ((navigationPhase as NavigationPhase) === 'to-destination' || (navigationPhase as NavigationPhase) === 'at-destination') {
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
    }, [
        navigationPhase,
        driverLocation?.latitude,
        driverLocation?.longitude,
        rideData.pickupLat,
        rideData.pickupLng,
        rideData.destLat,
        rideData.destLng,
        rideData.pickupAddress,
        rideData.destAddress
    ]);

    // Use OSRM navigation hook with stable configuration - MOVED BEFORE CALLBACKS
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
        calculateRouteOnly,
        getRouteGeoJSON,
        getMapboxCameraConfig,
        formatDistance,
        formatDuration,
        getManeuverIcon
    } = useOSRMNavigation({
        origin: navConfig?.origin || { latitude: 0, longitude: 0 },
        destination: navConfig?.destination || { latitude: 0, longitude: 0 },
        enabled: !!navConfig && !!driverLocation && !locationLoading &&
            (navigationPhase as NavigationPhase) !== 'at-pickup' &&
            (navigationPhase as NavigationPhase) !== 'at-destination' &&
            (navigationPhase as NavigationPhase) !== 'picking-up' &&
            (navigationPhase as NavigationPhase) !== 'completed' &&
            !isPhaseTransitioning,
        onDestinationReached: () => {
            console.log('Navigation destination reached');
        },
        onNavigationError: useCallback((error: Error) => {
            console.error('🚨 Navigation error:', error);
            setIsRouteTransitioning(false);
            Alert.alert(
                'Navigation Error',
                error.message,
                [
                    {
                        text: 'Retry', onPress: () => {
                            if (retryNavigationRef.current) {
                                retryNavigationRef.current();
                            }
                        }
                    },
                    { text: 'Cancel', onPress: () => router.back() }
                ]
            );
        }, [router]),
        onNewInstruction: useCallback((instruction: any) => {
            console.log('🗣️ New instruction:', instruction.voiceInstruction);
            speakInstruction(instruction.voiceInstruction);
        }, [speakInstruction])
    });





    // Handle phase transitions that require navigation actions
    const [hasHandledDestinationTransition, setHasHandledDestinationTransition] = useState(false);
    const [showRetryButton, setShowRetryButton] = useState(false);
    const [transitionStartTime, setTransitionStartTime] = useState<number | null>(null);

    useEffect(() => {
        // DISABLED: Auto-start navigation handles this better, preventing conflicts
        if (false && navigationPhase === 'to-destination' && !hasHandledDestinationTransition && clearRoute && restartNavigation) {
            console.log('🧹 Phase changed to to-destination, clearing route and restarting navigation');
            setHasHandledDestinationTransition(true);
            clearRoute();
            setIsRouteTransitioning(true);
            setTransitionStartTime(Date.now()); // Track when transition started

            // Restart navigation to destination after a short delay
            const timeoutId = setTimeout(async () => {
                try {
                    console.log('🚀 Restarting navigation to destination...');

                    const fromCoords = { latitude: rideData.pickupLat, longitude: rideData.pickupLng };
                    const toCoords = { latitude: rideData.destLat, longitude: rideData.destLng };

                    console.log('📍 From:', fromCoords);
                    console.log('📍 To:', toCoords);

                    // Validate coordinates
                    if (!fromCoords.latitude || !fromCoords.longitude || !toCoords.latitude || !toCoords.longitude) {
                        throw new Error('Invalid coordinates for navigation');
                    }

                    if (Math.abs(fromCoords.latitude) > 90 || Math.abs(fromCoords.longitude) > 180 ||
                        Math.abs(toCoords.latitude) > 90 || Math.abs(toCoords.longitude) > 180) {
                        throw new Error('Coordinates out of valid range');
                    }



                    // Add a timeout wrapper for the restart navigation call
                    console.log('🔄 About to call restartNavigation...');

                    let timeoutReached = false;
                    const timeoutId = setTimeout(() => {
                        console.log('⏰ Direct timeout reached, forcing error');
                        timeoutReached = true;
                    }, 7000); // 7 second direct timeout

                    try {
                        const result = await restartNavigation(fromCoords, toCoords);
                        clearTimeout(timeoutId);

                        if (timeoutReached) {
                            throw new Error('Navigation timeout - operation took too long');
                        }

                        console.log('✅ RestartNavigation completed successfully:', result);
                    } catch (navError) {
                        clearTimeout(timeoutId);
                        console.log('🔧 RestartNavigation threw error:', navError);

                        if (timeoutReached) {
                            throw new Error('Navigation timeout - operation took too long');
                        }

                        throw navError; // Re-throw the original error
                    }
                    console.log('✅ Navigation restarted successfully');
                    setIsRouteTransitioning(false);
                    setShowRetryButton(false);
                    setTransitionStartTime(null);
                } catch (error) {
                    console.error('❌ Failed to restart navigation to destination:', error);
                    setIsRouteTransitioning(false);
                    setShowRetryButton(false);
                    setTransitionStartTime(null);

                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    const isTimeoutError = errorMessage.includes('timeout');

                    if (isTimeoutError) {
                        // For timeout errors, show retry options immediately
                        Alert.alert(
                            'Route Calculation Timeout',
                            'The navigation service is taking too long to respond. This might be due to network issues or server problems.',
                            [
                                {
                                    text: 'Retry',
                                    onPress: () => {
                                        setHasHandledDestinationTransition(false);
                                    }
                                },
                                {
                                    text: 'Skip Navigation',
                                    onPress: () => {
                                        // Allow user to continue without turn-by-turn navigation
                                        console.log('🚗 User chose to skip navigation, continuing with basic directions');
                                        setIsRouteTransitioning(false);
                                        setHasHandledDestinationTransition(true);
                                        // The app will show the basic map view without navigation
                                    }
                                },
                                { text: 'Cancel Trip', onPress: () => router.back() }
                            ]
                        );
                    } else {
                        // For other errors, show standard error dialog
                        Alert.alert(
                            'Navigation Error',
                            `Failed to start navigation to destination: ${errorMessage}`,
                            [
                                {
                                    text: 'Retry',
                                    onPress: () => {
                                        setHasHandledDestinationTransition(false);
                                    }
                                },
                                { text: 'Cancel', onPress: () => router.back() }
                            ]
                        );
                    }
                }
            }, 1000); // Increased delay to 1 second

            // Show retry button after 5 seconds
            const retryButtonTimeoutId = setTimeout(() => {
                console.log('⏰ Showing retry button after 5 seconds');
                setShowRetryButton(true);
            }, 5000);

            // Force clear transition state after 10 seconds regardless of what happens
            const forceTimeoutId = setTimeout(() => {
                console.warn('🚨 Force clearing transition state after 10 seconds');
                setIsRouteTransitioning(false);
                setShowRetryButton(true);
            }, 10000);

            // Safety timeout to prevent getting stuck
            const safetyTimeoutId = setTimeout(() => {
                console.warn('⚠️ Navigation restart taking too long, clearing transition state');
                setIsRouteTransitioning(false);
                setShowRetryButton(false);
                Alert.alert(
                    'Navigation Service Timeout',
                    'The navigation service is not responding. This might be due to network connectivity issues or server problems.',
                    [
                        {
                            text: 'Retry',
                            onPress: () => {
                                setHasHandledDestinationTransition(false);
                            }
                        },
                        {
                            text: 'Skip Navigation',
                            onPress: () => {
                                console.log('🚗 User chose to skip navigation from safety timeout');
                                setIsRouteTransitioning(false);
                                setHasHandledDestinationTransition(true);
                            }
                        },
                        { text: 'Cancel Trip', onPress: () => router.back() }
                    ]
                );
            }, 12000); // 12 second safety timeout

            return () => {
                clearTimeout(timeoutId);
                clearTimeout(retryButtonTimeoutId);
                clearTimeout(safetyTimeoutId);
                clearTimeout(forceTimeoutId);
            };
        }
    }, [navigationPhase, hasHandledDestinationTransition, clearRoute, restartNavigation, rideData.pickupLat, rideData.pickupLng, rideData.destLat, rideData.destLng, router]);

    // Nuclear option - direct state monitor that forces clear
    useEffect(() => {
        if (isRouteTransitioning) {
            console.log('🔥 Nuclear timeout started - will force clear in 15 seconds (extended)');
            const nuclearTimeout = setTimeout(() => {
                // Check if navigation is already working before firing nuclear timeout
                if (isNavigating || route || isLoading) {
                    console.log('🎯 Nuclear timeout cancelled - navigation is working or loading');
                    return;
                }
                
                console.warn('☢️ NUCLEAR TIMEOUT: Force clearing isRouteTransitioning after 15 seconds');
                setIsRouteTransitioning(false);
                setHasHandledDestinationTransition(true);
                setShowRetryButton(false);
                setTransitionStartTime(null);

                Alert.alert(
                    'Navigation Timeout',
                    'Route calculation took too long. The app will continue with basic map navigation.',
                    [
                        { 
                            text: 'Retry Navigation', 
                            onPress: () => {
                                setHasHandledDestinationTransition(false);
                                setShowRetryButton(false);
                            }
                        },
                        { text: 'Continue with Map', style: 'default' }
                    ]
                );
            }, 15000); // Extended to 15 seconds since system is working

            return () => {
                console.log('🔥 Clearing nuclear timeout');
                clearTimeout(nuclearTimeout);
            };
        }
    }, [isRouteTransitioning]);

    // Aggressive watchdog effect to detect stuck transitions
    useEffect(() => {
        if (isRouteTransitioning && transitionStartTime) {
            console.log('🐕 Starting aggressive watchdog timer');

            const watchdogInterval = setInterval(() => {
                const elapsed = Date.now() - transitionStartTime;
                console.log(`⏱️ Transition running for ${elapsed}ms`);

                if (elapsed > 15000) { // 15 seconds
                    console.warn('🚨 Aggressive watchdog detected stuck transition, forcing clear');
                    setIsRouteTransitioning(false);
                    setShowRetryButton(true);
                    setTransitionStartTime(null);

                    Alert.alert(
                        'Navigation Timeout',
                        'Route calculation is taking too long. Choose an option to continue.',
                        [
                            {
                                text: 'Retry',
                                onPress: () => {
                                    setHasHandledDestinationTransition(false);
                                    setShowRetryButton(false);
                                }
                            },
                            {
                                text: 'Skip Navigation',
                                onPress: () => {
                                    console.log('🚗 User chose to skip navigation from aggressive watchdog');
                                    setIsRouteTransitioning(false);
                                    setHasHandledDestinationTransition(true);
                                    setShowRetryButton(false);
                                }
                            }
                        ]
                    );
                }
            }, 500); // Check every 500ms for more aggressive detection

            return () => {
                console.log('🐕 Clearing aggressive watchdog timer');
                clearInterval(watchdogInterval);
            };
        }
    }, [isRouteTransitioning, transitionStartTime]);

    // Reset the destination transition flag when phase changes away from to-destination
    useEffect(() => {
        if (navigationPhase !== 'to-destination') {
            setHasHandledDestinationTransition(false);
            setShowRetryButton(false);
        }
    }, [navigationPhase]);

    // Debug effect to track navigation state changes
    useEffect(() => {
        console.log('🔍 Navigation State Debug:', {
            navigationPhase,
            isNavigating,
            isLoading,
            isPhaseTransitioning,
            isRouteTransitioning,
            hasHandledDestinationTransition,
            hasNavConfig: !!navConfig,
            hasError: !!error,
            navConfigDetails: navConfig ? {
                origin: navConfig.origin,
                destination: navConfig.destination,
                destinationName: navConfig.destinationName
            } : null
        });
    }, [navigationPhase, isNavigating, isLoading, isPhaseTransitioning, isRouteTransitioning, hasHandledDestinationTransition, navConfig, error]);

    // Get driver's current location
    useEffect(() => {
        let isMounted = true;

        (async () => {
            try {
                // Request location permissions
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    if (isMounted) {
                        Alert.alert(
                            'Permission Denied',
                            'Location permission is required for navigation',
                            [{ text: 'OK', onPress: () => router.back() }]
                        );
                    }
                    return;
                }

                // Get initial location
                const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High
                });

                if (isMounted) {
                    setDriverLocation({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude
                    });
                    setLocationLoading(false);

                    console.log('📍 Initial driver location:', {
                        lat: location.coords.latitude,
                        lng: location.coords.longitude
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
                    setLocationLoading(false);
                    Alert.alert(
                        'Location Error',
                        'Unable to get your current location',
                        [{ text: 'Retry', onPress: () => window.location.reload() }]
                    );
                }
            }
        })();

        return () => {
            isMounted = false;
            if (locationSubscription.current) {
                locationSubscription.current.remove();
            }
        };
    }, [router]);

    // Memoized geofence callbacks to prevent recreation
    const onEnterPickupGeofence = useCallback(async () => {
        console.log('🎯 Entered pickup geofence, transitioning to at-pickup phase');
        await transitionToPhase('at-pickup');
        startTimer();
    }, [transitionToPhase, startTimer]);

    const onEnterDestinationGeofence = useCallback(async () => {
        console.log('🎯 Entered destination geofence, transitioning to at-destination phase');
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

    // Update retry navigation ref
    useEffect(() => {
        retryNavigationRef.current = retryNavigation;
    }, [retryNavigation]);

    // Extract maneuver points from route - memoized to prevent unnecessary recalculation
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
            console.log('📍 Maneuver points extracted:', points.length);
        }
    }, [route]);

    // Auto-start navigation when ready - memoized dependencies to prevent infinite loops
    useEffect(() => {
        if (!isNavigating && !isLoading && !error && navConfig && !isPhaseTransitioning && !isRouteTransitioning &&
            (navigationPhase === 'to-pickup' || (navigationPhase === 'to-destination' && hasHandledDestinationTransition))) {
            console.log('🚀 Auto-starting navigation for phase:', navigationPhase);
            startNavigation();

            // Initial voice announcement with delay
            const timeoutId = setTimeout(() => {
                if (navigationPhase === 'to-pickup') {
                    speakInstruction(`Starting navigation to pickup location at ${rideData.pickupAddress}`);
                } else if (navigationPhase === 'to-destination') {
                    speakInstruction(`Starting navigation to destination at ${rideData.destAddress}`);
                }
            }, 1000);

            return () => clearTimeout(timeoutId);
        }
    }, [
        navigationPhase,
        isNavigating,
        isLoading,
        error,
        isPhaseTransitioning,
        isRouteTransitioning,
        hasHandledDestinationTransition,
        navConfig?.origin?.latitude,
        navConfig?.origin?.longitude,
        navConfig?.destination?.latitude,
        navConfig?.destination?.longitude,
        startNavigation,
        speakInstruction,
        rideData.pickupAddress,
        rideData.destAddress
    ]);

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

    // Memoized event handlers
    const handlePassengerPickup = useCallback(async () => {
        stopTimer();

        try {
            console.log('🚗 Starting passenger pickup process from phase:', navigationPhase);

            // First, ensure we're in the correct phase
            if (navigationPhase !== 'at-pickup') {
                console.warn(`⚠️ Unexpected phase for pickup: ${navigationPhase}. Expected: at-pickup`);
                Alert.alert(
                    'Phase Error',
                    `Cannot start pickup from phase: ${navigationPhase}. Please try again.`,
                    [{ text: 'OK' }]
                );
                return;
            }

            // Transition to picking-up phase
            console.log('🔄 Transitioning from at-pickup to picking-up');
            const pickupResult = await transitionToPhase('picking-up');

            if (!pickupResult.success) {
                console.error('❌ Failed to transition to picking-up phase:', pickupResult.error);
                Alert.alert(
                    'Phase Transition Error',
                    `Failed to update navigation phase: ${pickupResult.error}`,
                    [{ text: 'OK' }]
                );
                return;
            }

            console.log('✅ Successfully transitioned to picking-up phase');

            // Wait 2 seconds for pickup animation/UI, then transition to destination
            const timeoutId = setTimeout(async () => {
                try {
                    console.log('🎯 About to transition to destination phase');

                    // Directly attempt the transition - the phase manager will validate the current phase
                    console.log('🎯 Transitioning from picking-up to to-destination');
                    const result = await transitionToPhase('to-destination');

                    if (!result.success) {
                        console.error('❌ Transition to destination failed:', result.error);
                        console.error('❌ Transition was from:', result.fromPhase, 'to:', result.toPhase);

                        // If the transition failed due to wrong phase, show specific error
                        if (result.error?.includes('Invalid transition')) {
                            Alert.alert(
                                'Navigation Error',
                                'Navigation phase is out of sync. The pickup process will restart.',
                                [
                                    { text: 'Restart Pickup', onPress: () => handlePassengerPickup() },
                                    { text: 'Cancel', onPress: () => router.back() }
                                ]
                            );
                        } else {
                            Alert.alert(
                                'Navigation Error',
                                `Failed to start navigation to destination: ${result.error}`,
                                [
                                    { text: 'Retry', onPress: () => handlePassengerPickup() },
                                    { text: 'Cancel', onPress: () => router.back() }
                                ]
                            );
                        }
                    } else {
                        console.log('✅ Successfully transitioned to to-destination phase');
                    }
                } catch (error) {
                    console.error('❌ Failed to transition to destination phase:', error);
                    Alert.alert(
                        'Navigation Error',
                        'Failed to start navigation to destination. Please try again.',
                        [
                            { text: 'Retry', onPress: () => handlePassengerPickup() },
                            { text: 'Cancel', onPress: () => router.back() }
                        ]
                    );
                }
            }, 2000);

            // Safety timeout - if we're still in picking-up phase after 15 seconds, force transition
            const safetyTimeoutId = setTimeout(() => {
                console.log('⏰ Safety timeout check - current phase:', navigationPhase);
                if ((navigationPhase as NavigationPhase) === 'picking-up') {
                    console.warn('⚠️ Safety timeout: forcing transition to destination phase');
                    transitionToPhase('to-destination').catch(error => {
                        console.error('❌ Safety transition failed:', error);
                        Alert.alert(
                            'Navigation Error',
                            'Navigation appears to be stuck. Please restart the trip.',
                            [{ text: 'OK', onPress: () => router.back() }]
                        );
                    });
                }
            }, 15000);

            // Clear safety timeout when component unmounts or phase changes
            return () => {
                clearTimeout(timeoutId);
                clearTimeout(safetyTimeoutId);
            };

        } catch (error) {
            console.error('❌ Failed to transition to picking-up phase:', error);
            Alert.alert(
                'Phase Transition Error',
                'Failed to update navigation phase. Please try again.',
                [{ text: 'OK' }]
            );
        }
    }, [stopTimer, transitionToPhase, navigationPhase, router]);

    const handleTripComplete = useCallback(async () => {
        try {
            await transitionToPhase('completed');

            Alert.alert(
                'Trip Completed! 🎉',
                `Successfully dropped off ${rideData.passengerName} at ${rideData.destAddress}`,
                [
                    {
                        text: 'Complete & Rate',
                        onPress: () => router.replace('/(app)')
                    }
                ]
            );
        } catch (error) {
            console.error('❌ Failed to complete trip:', error);
            Alert.alert(
                'Trip Completed! 🎉',
                `Successfully dropped off ${rideData.passengerName} at ${rideData.destAddress}`,
                [
                    {
                        text: 'Complete & Rate',
                        onPress: () => router.replace('/(app)')
                    }
                ]
            );
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
            console.log('🎯 Recentering map on driver');
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
            console.warn('Error calculating ETA:', error);
            return '-- --';
        }
    }, [progress?.durationRemaining]);

    // Cleanup on unmount only
    useEffect(() => {
        return () => {
            console.log('🧹 Driver navigation component unmounting, cleaning up...');
            Speech.stop();
            cleanupGeofencing();
            cleanupPhaseManager();
        };
    }, []); // Empty dependencies - only run on unmount

    // Show loading state
    if (locationLoading || (isLoading && !route) || isRouteTransitioning) {
        let title = 'Getting Your Location...';
        let subtitle = 'Please wait while we locate you';

        if (isRouteTransitioning) {
            if (navigationPhase === 'to-destination') {
                title = 'Starting Trip to Destination';
                subtitle = 'Calculating route to drop-off location...';
            } else {
                title = 'Updating Navigation...';
                subtitle = `Transitioning to ${navigationPhase} phase`;
            }
            if (transitionProgress > 0) {
                subtitle += ` (${transitionProgress}%)`;
            }
        } else if (isLoading && !route) {
            title = 'Starting Navigation...';
            subtitle = `Calculating route to ${navConfig?.destinationName}`;
        }

        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <LoadingScreen
                    title={title}
                    subtitle={subtitle}
                />
                {/* Add a manual retry button if stuck for too long */}
                {isRouteTransitioning && navigationPhase === 'to-destination' && showRetryButton && (
                    <View className="absolute bottom-20 left-4 right-4">
                        <View className="bg-white rounded-lg p-4 shadow-lg">
                            <Text className="text-center text-gray-600 mb-3">
                                Taking longer than expected?
                            </Text>
                            <Text className="text-center text-xs text-gray-500 mb-3">
                                Debug: isRouteTransitioning={isRouteTransitioning.toString()},
                                hasHandled={hasHandledDestinationTransition.toString()},
                                isLoading={isLoading.toString()}
                            </Text>
                            <TouchableOpacity
                                className="bg-blue-500 rounded-lg py-3 px-6 mb-2"
                                onPress={async () => {
                                    console.log('🔄 Manual retry triggered');
                                    setIsRouteTransitioning(false);
                                    setHasHandledDestinationTransition(false);
                                    setShowRetryButton(false);

                                    // Try alternative approach: use startNavigation instead of restartNavigation
                                    try {
                                        console.log('🔄 Trying alternative navigation start...');
                                        setIsRouteTransitioning(true);

                                        // Clear any existing route first
                                        if (clearRoute) {
                                            clearRoute();
                                            await new Promise(resolve => setTimeout(resolve, 500));
                                        }

                                        // Try starting navigation directly
                                        if (startNavigation) {
                                            await startNavigation();
                                            setIsRouteTransitioning(false);
                                            console.log('✅ Alternative navigation start successful');
                                        }
                                    } catch (error) {
                                        console.error('❌ Alternative navigation start failed:', error);
                                        setIsRouteTransitioning(false);
                                        Alert.alert(
                                            'Navigation Error',
                                            'Unable to start navigation. Please check your internet connection and try again.',
                                            [{ text: 'OK' }]
                                        );
                                    }
                                }}
                            >
                                <Text className="text-white text-center font-semibold">
                                    Retry Navigation
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="bg-orange-500 rounded-lg py-2 px-4 mb-2"
                                onPress={() => {
                                    console.log('�  User chose to skip navigation from retry button');
                                    setIsRouteTransitioning(false);
                                    setHasHandledDestinationTransition(true);
                                    setShowRetryButton(false);
                                }}
                            >
                                <Text className="text-white text-center font-semibold text-sm">
                                    Skip Navigation
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="bg-red-500 rounded-lg py-2 px-4"
                                onPress={() => {
                                    console.log('🔧 Force reset all states');
                                    setIsRouteTransitioning(false);
                                    setHasHandledDestinationTransition(false);
                                    setShowRetryButton(false);
                                }}
                            >
                                <Text className="text-white text-center font-semibold text-sm">
                                    Force Reset
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    // Show error state
    if ((error && !route) || phaseTransitionError) {
        const errorTitle = phaseTransitionError ? 'Phase Transition Error' : 'Navigation Error';
        const errorMessage = phaseTransitionError || error?.message || 'Unknown error occurred';
        const onRetry = phaseTransitionError ? clearPhaseError : retryNavigation;

        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <ErrorScreen
                    title={errorTitle}
                    message={errorMessage}
                    onRetry={onRetry}
                    onGoBack={() => router.back()}
                />
            </SafeAreaView>
        );
    }

    // Show pickup waiting screen when at pickup location
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

    // Show loading screen when picking up passenger
    if ((navigationPhase as NavigationPhase) === 'picking-up') {
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

    // Show arrival at destination screen
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

    // Get route GeoJSON for display
    const routeGeoJSON = getRouteGeoJSON();

    // Main navigation view
    return (
        <View className="flex-1">
            <Stack.Screen options={{ headerShown: false }} />

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
                onGeofenceTransition={(geofenceId, visible) => {
                    console.log(`🔄 Geofence transition callback: ${geofenceId} -> ${visible ? 'visible' : 'hidden'}`);
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
                    onRouteOptions={() => {
                        Alert.alert(
                            'Navigation Info',
                            `Phase: ${navigationPhase}\nIn Pickup Zone: ${isInPickupGeofence}\nIn Destination Zone: ${isInDestinationGeofence}`,
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