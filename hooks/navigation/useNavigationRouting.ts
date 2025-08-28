// hooks/useNavigationRouting.ts
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useOSRMNavigation } from '@/hooks/useOSRMNavigation';
import { NavigationPhase, RideNavigationData } from '@/hooks/navigation/types';

interface NavigationRoutingProps {
    rideData: RideNavigationData;
    navigationPhase: NavigationPhase;
    driverLocation: { latitude: number; longitude: number } | null;
    locationLoading: boolean;
    isPhaseTransitioning: boolean;
    onNavigationError?: (error: Error) => void;
    onNewInstruction?: (instruction: any) => void;
}

interface NavigationRoutingReturn {
    navConfig: any;
    isNavigating: boolean;
    isLoading: boolean;
    route: any;
    currentPosition: any;
    currentHeading: number;
    progress: any;
    currentInstruction: any;
    error: Error | null;
    isRouteTransitioning: boolean;
    hasHandledDestinationTransition: boolean;
    showRetryButton: boolean;
    transitionStartTime: number | null;
    maneuverPoints: Array<{
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
    }>;
    // Actions
    startNavigation: () => Promise<void>;
    stopNavigation: () => void;
    retryNavigation: () => Promise<void>;
    clearRoute: () => void;
    restartNavigation: (origin: any, destination: any) => Promise<void>;
    getRouteGeoJSON: () => any;
    getMapboxCameraConfig: () => any;
    formatDistance: (meters: number) => string;
    formatDuration: (seconds: number) => string;
    setIsRouteTransitioning: (value: boolean) => void;
    setHasHandledDestinationTransition: (value: boolean) => void;
    setShowRetryButton: (value: boolean) => void;
    setTransitionStartTime: (value: number | null) => void;
}

export const useNavigationRouting = ({
                                         rideData,
                                         navigationPhase,
                                         driverLocation,
                                         locationLoading,
                                         isPhaseTransitioning,
                                         onNavigationError,
                                         onNewInstruction
                                     }: NavigationRoutingProps): NavigationRoutingReturn => {
    // Route transition state
    const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
    const [hasHandledDestinationTransition, setHasHandledDestinationTransition] = useState(false);
    const [showRetryButton, setShowRetryButton] = useState(false);
    const [transitionStartTime, setTransitionStartTime] = useState<number | null>(null);
    const [maneuverPoints, setManeuverPoints] = useState<Array<{
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
    }>>([]);

    const retryNavigationRef = useRef<(() => void) | null>(null);

    // Memoized navigation configuration
    const navConfig = useMemo(() => {
        console.log('🔧 Calculating navConfig for phase:', navigationPhase, 'driverLocation:', !!driverLocation);

        if (navigationPhase === 'to-pickup' && driverLocation) {
            const config = {
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
            console.log('📍 NavConfig for pickup:', config);
            return config;
        }

        if (navigationPhase === 'to-destination') {
            // Use pickup location as origin for destination navigation
            const config = {
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
            console.log('📍 NavConfig for destination:', config);
            return config;
        }

        console.log('📍 No navConfig for phase:', navigationPhase);
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

    // OSRM Navigation hook
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
        getMapboxCameraConfig,
        formatDistance,
        formatDuration,
    } = useOSRMNavigation({
        origin: navConfig?.origin || { latitude: 0, longitude: 0 },
        destination: navConfig?.destination || { latitude: 0, longitude: 0 },
        enabled: !!navConfig && !!driverLocation && !locationLoading &&
            navigationPhase !== 'at-pickup' &&
            navigationPhase !== 'at-destination' &&
            navigationPhase !== 'picking-up' &&
            navigationPhase !== 'completed' &&
            !isPhaseTransitioning,
        onDestinationReached: () => {
            console.log('Navigation destination reached');
        },
        onNavigationError: useCallback((error: Error) => {
            console.error('🚨 Navigation error:', error);
            setIsRouteTransitioning(false);
            onNavigationError?.(error);
        }, [onNavigationError]),
        onNewInstruction: useCallback((instruction: any) => {
            console.log('🗣️ New instruction:', instruction.voiceInstruction);
            onNewInstruction?.(instruction);
        }, [onNewInstruction])
    });

    // Update retry navigation ref
    useEffect(() => {
        retryNavigationRef.current = retryNavigation;
    }, [retryNavigation]);

    // Extract maneuver points from route
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

    // Reset destination transition flag when phase changes away from to-destination
    useEffect(() => {
        if (navigationPhase !== 'to-destination') {
            setHasHandledDestinationTransition(false);
            setShowRetryButton(false);
        }
    }, [navigationPhase]);

    // Handle navigation config changes and force restart when transitioning to destination
    useEffect(() => {
        // Only handle destination phase transitions
        if (navigationPhase !== 'to-destination') return;

        // Skip if navigation is already running or we've already handled this transition
        if (isNavigating || hasHandledDestinationTransition || !navConfig) return;

        // Skip if currently loading or in error state
        if (isLoading || error) return;

        console.log('🔄 Navigation config changed to destination, forcing navigation restart');

        const handleDestinationNavigation = async () => {
            try {
                setIsRouteTransitioning(true);
                setTransitionStartTime(Date.now());

                // Clear any existing navigation state
                stopNavigation();
                clearRoute();

                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 200));

                console.log('🚀 Starting destination navigation with config:', navConfig);

                // Use restartNavigation for better state management
                await restartNavigation(navConfig.origin, navConfig.destination);

                setIsRouteTransitioning(false);
                setHasHandledDestinationTransition(true);
                setTransitionStartTime(null);

                console.log('✅ Destination navigation started successfully');

            } catch (error) {
                console.error('❌ Failed to start destination navigation:', error);
                setIsRouteTransitioning(false);
                setTransitionStartTime(null);
                setShowRetryButton(true);
            }
        };

        // Add a small delay to ensure phase transition is complete
        const timeoutId = setTimeout(handleDestinationNavigation, 500);

        return () => clearTimeout(timeoutId);

    }, [
        navigationPhase,
        navConfig?.origin?.latitude,
        navConfig?.origin?.longitude,
        navConfig?.destination?.latitude,
        navConfig?.destination?.longitude,
        isNavigating,
        hasHandledDestinationTransition,
        isLoading,
        error,
        stopNavigation,
        clearRoute,
        restartNavigation
    ]);

    // Nuclear timeout effect
    useEffect(() => {
        if (isRouteTransitioning) {
            console.log('🔥 Nuclear timeout started - will force clear in 15 seconds');
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
            }, 15000);

            return () => {
                console.log('🔥 Clearing nuclear timeout');
                clearTimeout(nuclearTimeout);
            };
        }
    }, [isRouteTransitioning, isNavigating, route, isLoading]);

    // Aggressive watchdog effect
    useEffect(() => {
        if (isRouteTransitioning && transitionStartTime) {
            console.log('🐕 Starting aggressive watchdog timer');

            const watchdogInterval = setInterval(() => {
                const elapsed = Date.now() - transitionStartTime;
                console.log(`⏱️ Transition running for ${elapsed}ms`);

                if (elapsed > 15000) {
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
            }, 500);

            return () => {
                console.log('🐕 Clearing aggressive watchdog timer');
                clearInterval(watchdogInterval);
            };
        }
    }, [isRouteTransitioning, transitionStartTime]);

    return {
        navConfig,
        isNavigating,
        isLoading,
        route,
        currentPosition,
        currentHeading,
        progress,
        currentInstruction,
        error,
        isRouteTransitioning,
        hasHandledDestinationTransition,
        showRetryButton,
        transitionStartTime,
        maneuverPoints,
        // Actions
        startNavigation,
        stopNavigation,
        retryNavigation,
        clearRoute,
        restartNavigation,
        getRouteGeoJSON,
        getMapboxCameraConfig,
        formatDistance,
        formatDuration,
        setIsRouteTransitioning,
        setHasHandledDestinationTransition,
        setShowRetryButton,
        setTransitionStartTime,
    };
};