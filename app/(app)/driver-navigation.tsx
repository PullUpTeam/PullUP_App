import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { View, SafeAreaView, Alert, Text, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Speech from 'expo-speech';

// Navigation hooks
import { useOSRMNavigation } from '@/hooks/useOSRMNavigation';
import { usePickupTimer } from '@/hooks/navigation/usePickupTimer';
import { useVoiceGuidance } from '@/hooks/navigation/useVoiceGuidance';
import { useNavigationParams } from '@/hooks/navigation/useNavigationParams';
import { useLocationTracking, DriverLocationData } from '@/hooks/navigation/useLocationTracking';
import { useNavigationState } from '@/hooks/navigation/useNavigationState';
import { useEnhancedGeofencing } from '@/hooks/navigation/useEnhancedGeofencing';
import { useCameraFollow } from '@/hooks/navigation/useCameraFollow';

// Components
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

// Types & Constants
import { GEOFENCE_RADIUS_METERS, NavigationPhase } from '@/hooks/navigation/types';

export default function GeofencedDriverNavigationScreen() {
    const router = useRouter();
    const mapRef = useRef<NavigationMapboxMapRef>(null);
    const navigationStartedRef = useRef<{ phase: NavigationPhase | null; started: boolean }>({ phase: null, started: false });
    const hasHandledDestinationTransitionRef = useRef(false);

    // Auto-recenter timer ref
    const autoRecenterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isUserInteracting, setIsUserInteracting] = useState(false);

    // Parse and validate URL params
    const { rideData, isValid, error: paramsError } = useNavigationParams();

    // Consolidated navigation state
    const {
        navigationPhase,
        isPhaseTransitioning,
        isRouteTransitioning,
        isMuted,
        enableOnchainAttestations,
        transitionToPhase,
        toggleMute,
        setOnchainAttestations,
        startRouteTransition,
        endRouteTransition,
    } = useNavigationState();

    // Camera follow hook for smooth camera control
    const {
        cameraState,
        updateCamera,
        setFollowing,
        config: cameraConfig
    } = useCameraFollow({
        baseZoom: 18,
        minZoom: 15,
        basePitch: 60,
        rotateWithHeading: true,
        lookAheadFactor: 0.12
    });

    // Handle location updates for camera following
    const handleLocationUpdate = useCallback((location: DriverLocationData) => {
        // Only update camera if not in user interaction mode
        if (!isUserInteracting && (navigationPhase === 'to-pickup' || navigationPhase === 'to-destination')) {
            updateCamera(location);
        }
    }, [isUserInteracting, navigationPhase, updateCamera]);

    // Handle user map interaction - pause follow mode temporarily
    const handleUserInteraction = useCallback(() => {
        setIsUserInteracting(true);
        setFollowing(false);

        // Clear any existing timeout
        if (autoRecenterTimeoutRef.current) {
            clearTimeout(autoRecenterTimeoutRef.current);
        }

        // Auto-resume follow mode after 5 seconds of inactivity
        autoRecenterTimeoutRef.current = setTimeout(() => {
            setIsUserInteracting(false);
            setFollowing(true);
            mapRef.current?.resumeFollowMode('course');
        }, 5000);
    }, [setFollowing]);

    // Location tracking - memoized callbacks to prevent infinite re-renders
    const handleLocationError = useCallback(() => {
        router.back();
    }, [router]);

    const handleDestinationReached = useCallback(() => {
        console.log('Navigation destination reached');
    }, []);

    // Location tracking with camera update callback
    const {
        driverLocation,
        locationLoading,
        locationError
    } = useLocationTracking({
        onLocationError: handleLocationError,
        onLocationUpdate: handleLocationUpdate,
        updateInterval: 400,  // Faster updates for smoother camera
        distanceInterval: 1   // More sensitive distance threshold
    });

    // Cleanup auto-recenter timeout
    useEffect(() => {
        return () => {
            if (autoRecenterTimeoutRef.current) {
                clearTimeout(autoRecenterTimeoutRef.current);
            }
        };
    }, []);

    // Maneuver points for map display (must be state to trigger re-renders)
    const [maneuverPoints, setManeuverPoints] = useState<Array<{
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
    }>>([]);

    // Memoized locations for geofencing (use defaults if no rideData yet)
    const pickupLocation = useMemo(() => ({
        latitude: rideData?.pickupLat ?? 0,
        longitude: rideData?.pickupLng ?? 0
    }), [rideData?.pickupLat, rideData?.pickupLng]);

    const destinationLocation = useMemo(() => ({
        latitude: rideData?.destLat ?? 0,
        longitude: rideData?.destLng ?? 0
    }), [rideData?.destLat, rideData?.destLng]);

    // Navigation config based on current phase
    const navConfig = useMemo(() => {
        if (!rideData) return null;

        if (navigationPhase === 'to-pickup' && driverLocation) {
            return {
                origin: { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
                destination: pickupLocation,
                destinationName: rideData.pickupAddress,
            };
        }

        if (navigationPhase === 'to-destination') {
            return {
                origin: pickupLocation,
                destination: destinationLocation,
                destinationName: rideData.destAddress,
            };
        }

        return null;
    }, [navigationPhase, driverLocation, pickupLocation, destinationLocation, rideData]);

    // Timer and voice hooks
    const { pickupTimer, startTimer, stopTimer, formatTimer } = usePickupTimer();
    const { speakInstruction } = useVoiceGuidance(isMuted);

    // Geofence callbacks
    const handleEnterPickupGeofence = useCallback(() => {
        console.log('🎯 Entered pickup geofence');
        transitionToPhase('at-pickup').then((result) => {
            if (result.success) {
                startTimer();
            }
        });
    }, [transitionToPhase, startTimer]);

    const handleEnterDestinationGeofence = useCallback(() => {
        console.log('🎯 Entered destination geofence');
        transitionToPhase('at-destination');
    }, [transitionToPhase]);

    const handlePassengerConfirmation = useCallback((type: 'pickup' | 'destination', confirmed: boolean) => {
        console.log(`✅ Passenger ${type} confirmation: ${confirmed}`);
    }, []);

    const handleConfirmationTimeout = useCallback((type: 'pickup' | 'destination') => {
        console.log(`⏰ ${type} confirmation timed out`);
    }, []);

    // Enhanced geofencing with confirmation flow
    const {
        isInPickupGeofence,
        isInDestinationGeofence,
        geofenceVisibility,
        cleanup: cleanupGeofencing,
        geofenceState,
        triggerManualConfirmation,
        cancelConfirmation,
        isCreatingAttestation,
        attestationError,
        isWalletConnected,
    } = useEnhancedGeofencing({
        driverLocation,
        pickupLocation,
        destinationLocation,
        pickupAddress: rideData?.pickupAddress,
        destinationAddress: rideData?.destAddress,
        navigationPhase,
        onEnterPickupGeofence: handleEnterPickupGeofence,
        onEnterDestinationGeofence: handleEnterDestinationGeofence,
        onPassengerConfirmation: handlePassengerConfirmation,
        onConfirmationTimeout: handleConfirmationTimeout,
        enableOnchainAttestations,
    });

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
        getRouteGeoJSON,
        formatDistance,
        formatDuration,
    } = useOSRMNavigation({
        origin: navConfig?.origin || { latitude: 0, longitude: 0 },
        destination: navConfig?.destination || { latitude: 0, longitude: 0 },
        enabled: !!navConfig && !!driverLocation && !locationLoading &&
            (navigationPhase === 'to-pickup' || navigationPhase === 'to-destination') &&
            !isPhaseTransitioning && isValid,
        onDestinationReached: handleDestinationReached,
        onNavigationError: useCallback((err: Error) => {
            console.error('🚨 Navigation error:', err);
            endRouteTransition();
        }, [endRouteTransition]),
        onNewInstruction: useCallback((instruction: { voiceInstruction?: string }) => {
            if (instruction.voiceInstruction) {
                speakInstruction(instruction.voiceInstruction);
            }
        }, [speakInstruction])
    });

    // Extract maneuver points from route
    useEffect(() => {
        if (route?.instructions && route.instructions.length > 0) {
            console.log('🗺️ Extracting maneuver points from', route.instructions.length, 'instructions');

            const points = route.instructions
                .filter(inst => inst.maneuver?.location)
                .map(inst => ({
                    coordinate: [
                        inst.maneuver.location.longitude,
                        inst.maneuver.location.latitude
                    ] as [number, number],
                    type: inst.maneuver.type || 'straight',
                    modifier: inst.maneuver.modifier,
                    instruction: inst.text || ''
                }));

            console.log('🗺️ Extracted', points.length, 'maneuver points');
            setManeuverPoints(points);
        } else if (route) {
            console.log('⚠️ Route exists but no instructions:', route);
        }
    }, [route]);

    // Auto-start navigation for both pickup and destination phases
    useEffect(() => {
        if (!rideData) return;

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
        navConfig,
        driverLocation,
        locationLoading,
        rideData,
        startNavigation,
        speakInstruction
    ]);

    // Reset navigation started ref when phase changes
    useEffect(() => {
        if (navigationStartedRef.current.phase !== navigationPhase) {
            navigationStartedRef.current = { phase: null, started: false };
        }
    }, [navigationPhase]);

    // Event handlers
    const handlePassengerPickup = useCallback(async () => {
        if (!rideData) return;

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
            endRouteTransition();
            hasHandledDestinationTransitionRef.current = false;

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
    }, [stopTimer, navigationPhase, transitionToPhase, stopNavigation, clearRoute, speakInstruction, rideData, endRouteTransition]);

    const handleTripComplete = useCallback(async () => {
        if (!rideData) return;

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
        // Clear any pending auto-recenter timeout
        if (autoRecenterTimeoutRef.current) {
            clearTimeout(autoRecenterTimeoutRef.current);
            autoRecenterTimeoutRef.current = null;
        }

        // Resume follow mode
        setIsUserInteracting(false);
        setFollowing(true);
        mapRef.current?.resumeFollowMode('course');

        // Also do an immediate flyTo for responsiveness
        if (currentPosition && mapRef.current) {
            mapRef.current.flyTo(
                [currentPosition.longitude, currentPosition.latitude],
                18,
                currentHeading
            );
        }
    }, [currentPosition, currentHeading, setFollowing]);

    const handleVolumeToggle = useCallback(() => {
        toggleMute();
        if (isMuted) {
            speakInstruction('Voice guidance enabled');
        }
    }, [isMuted, toggleMute, speakInstruction]);

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

    // Early return if no valid ride data (after all hooks)
    if (!isValid || !rideData) {
        return (
            <SafeAreaView className="flex-1 bg-gray-100">
                <Stack.Screen options={{ headerShown: false }} />
                <ErrorScreen
                    title="Invalid Navigation Data"
                    message={paramsError || "The ride information is missing or invalid. Please try again."}
                    onGoBack={() => router.replace('/(app)')}
                />
            </SafeAreaView>
        );
    }

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
                // New camera state from useCameraFollow hook
                // Only pass cameraState when we have valid coordinates (not [0,0])
                cameraState={cameraState.isFollowing &&
                    cameraState.centerCoordinate[0] !== 0 &&
                    cameraState.centerCoordinate[1] !== 0 ? {
                    centerCoordinate: cameraState.centerCoordinate,
                    heading: cameraState.heading,
                    zoom: cameraState.zoom,
                    pitch: cameraState.pitch
                } : undefined}
                bearing={currentHeading}
                pitch={60}
                zoomLevel={18}
                followMode={isUserInteracting ? 'none' : 'course'}
                onUserInteraction={handleUserInteraction}
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
            {navigationPhase === 'to-destination' && !isNavigating && !isLoading && error && hasHandledDestinationTransitionRef.current && (
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
                            onToggleAttestations={setOnchainAttestations}
                            onTriggerManualConfirmation={triggerManualConfirmation}
                            onCancelConfirmation={cancelConfirmation}
                        />
                    </View>
                )}
        </View>
    );
}