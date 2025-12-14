// hooks/navigation/useEnhancedGeofencing.ts
// Fixed version that prevents infinite re-renders by using refs for callbacks
// and avoiding unnecessary state synchronization effects

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getDistance } from 'geolib';
import { GEOFENCE_CHECK_INTERVAL, GEOFENCE_RADIUS_METERS, NavigationPhase } from "@/hooks/navigation/types";
import { useDriverConfirmation } from '@/hooks/navigation/useDriverConfirmation';
import { OnchainLocationAttestation, RideAttestations } from '@/lib/blockchain/astralSDK';

interface UseEnhancedGeofencingProps {
    driverLocation: { latitude: number; longitude: number } | null;
    pickupLocation: { latitude: number; longitude: number };
    destinationLocation: { latitude: number; longitude: number };
    pickupAddress?: string;
    destinationAddress?: string;
    navigationPhase: NavigationPhase;

    // Ride context for attestations
    rideId?: string;
    driverId?: string;
    passengerId?: string;

    // Callbacks for geofence entry (triggers confirmation flow)
    onEnterPickupGeofence: () => void;
    onEnterDestinationGeofence: () => void;

    // Callbacks for passenger confirmation - now includes both entry and confirmation attestations
    onPassengerConfirmation: (
        type: 'pickup' | 'destination',
        confirmed: boolean,
        entryAttestation?: OnchainLocationAttestation,
        confirmationAttestation?: OnchainLocationAttestation
    ) => void;
    onConfirmationTimeout: (
        type: 'pickup' | 'destination',
        entryAttestation?: OnchainLocationAttestation,
        confirmationAttestation?: OnchainLocationAttestation
    ) => void;

    // Onchain attestation settings
    enableOnchainAttestations?: boolean;
    confirmationTimeoutMs?: number;
}

interface GeofenceVisibility {
    showPickupGeofence: boolean;
    showDestinationGeofence: boolean;
}

interface GeofenceAttestationState {
    entryAttestation: OnchainLocationAttestation | null;
    confirmationAttestation: OnchainLocationAttestation | null;
    isWaitingForConfirmation: boolean;
    hasConfirmed: boolean;
    timeRemaining: number;
}

interface GeofenceState {
    pickup: GeofenceAttestationState;
    destination: GeofenceAttestationState;
}

const initialAttestationState: GeofenceAttestationState = {
    entryAttestation: null,
    confirmationAttestation: null,
    isWaitingForConfirmation: false,
    hasConfirmed: false,
    timeRemaining: 0,
};

const initialGeofenceState: GeofenceState = {
    pickup: { ...initialAttestationState },
    destination: { ...initialAttestationState },
};

export const useEnhancedGeofencing = ({
    driverLocation,
    pickupLocation,
    destinationLocation,
    pickupAddress,
    destinationAddress,
    navigationPhase,
    rideId,
    driverId,
    passengerId,
    onEnterPickupGeofence,
    onEnterDestinationGeofence,
    onPassengerConfirmation,
    onConfirmationTimeout,
    enableOnchainAttestations = false,
    confirmationTimeoutMs = 30000,
}: UseEnhancedGeofencingProps) => {
    // Core geofence state
    const [isInPickupGeofence, setIsInPickupGeofence] = useState(false);
    const [isInDestinationGeofence, setIsInDestinationGeofence] = useState(false);
    const [geofenceState, setGeofenceState] = useState<GeofenceState>(initialGeofenceState);

    // Refs for tracking entry state (prevents re-renders)
    const hasEnteredPickupRef = useRef(false);
    const hasEnteredDestinationRef = useRef(false);
    const geofenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Store callbacks in refs to avoid effect dependencies
    const callbacksRef = useRef({
        onEnterPickupGeofence,
        onEnterDestinationGeofence,
        onPassengerConfirmation,
        onConfirmationTimeout,
    });

    // Update refs when callbacks change
    useEffect(() => {
        callbacksRef.current = {
            onEnterPickupGeofence,
            onEnterDestinationGeofence,
            onPassengerConfirmation,
            onConfirmationTimeout,
        };
    }, [onEnterPickupGeofence, onEnterDestinationGeofence, onPassengerConfirmation, onConfirmationTimeout]);

    // Stable geofence IDs
    const pickupGeofenceId = useMemo(
        () => `pickup-${pickupLocation.latitude.toFixed(6)}-${pickupLocation.longitude.toFixed(6)}`,
        [pickupLocation.latitude, pickupLocation.longitude]
    );

    const destinationGeofenceId = useMemo(
        () => `destination-${destinationLocation.latitude.toFixed(6)}-${destinationLocation.longitude.toFixed(6)}`,
        [destinationLocation.latitude, destinationLocation.longitude]
    );

    // Confirmation callbacks - use refs to prevent re-render loops
    const handlePickupConfirmation = useCallback((
        confirmed: boolean,
        entryAttestation?: OnchainLocationAttestation,
        confirmationAttestation?: OnchainLocationAttestation
    ) => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                hasConfirmed: true,
                isWaitingForConfirmation: false,
                entryAttestation: entryAttestation ?? prev.pickup.entryAttestation,
                confirmationAttestation: confirmationAttestation ?? prev.pickup.confirmationAttestation,
            },
        }));
        callbacksRef.current.onPassengerConfirmation('pickup', confirmed, entryAttestation, confirmationAttestation);
    }, []);

    const handlePickupTimeout = useCallback((
        entryAttestation?: OnchainLocationAttestation,
        confirmationAttestation?: OnchainLocationAttestation
    ) => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                isWaitingForConfirmation: false,
                entryAttestation: entryAttestation ?? prev.pickup.entryAttestation,
                confirmationAttestation: confirmationAttestation ?? prev.pickup.confirmationAttestation,
            },
        }));
        callbacksRef.current.onConfirmationTimeout('pickup', entryAttestation, confirmationAttestation);
    }, []);

    const handleDestinationConfirmation = useCallback((
        confirmed: boolean,
        entryAttestation?: OnchainLocationAttestation,
        confirmationAttestation?: OnchainLocationAttestation
    ) => {
        setGeofenceState(prev => ({
            ...prev,
            destination: {
                ...prev.destination,
                hasConfirmed: true,
                isWaitingForConfirmation: false,
                entryAttestation: entryAttestation ?? prev.destination.entryAttestation,
                confirmationAttestation: confirmationAttestation ?? prev.destination.confirmationAttestation,
            },
        }));
        callbacksRef.current.onPassengerConfirmation('destination', confirmed, entryAttestation, confirmationAttestation);
    }, []);

    const handleDestinationTimeout = useCallback((
        entryAttestation?: OnchainLocationAttestation,
        confirmationAttestation?: OnchainLocationAttestation
    ) => {
        setGeofenceState(prev => ({
            ...prev,
            destination: {
                ...prev.destination,
                isWaitingForConfirmation: false,
                entryAttestation: entryAttestation ?? prev.destination.entryAttestation,
                confirmationAttestation: confirmationAttestation ?? prev.destination.confirmationAttestation,
            },
        }));
        callbacksRef.current.onConfirmationTimeout('destination', entryAttestation, confirmationAttestation);
    }, []);

    // Driver confirmation hooks - now with ride context for attestations
    const pickupConfirmation = useDriverConfirmation({
        geofenceId: pickupGeofenceId,
        geofenceType: 'pickup',
        location: pickupLocation,
        address: pickupAddress,
        rideId,
        driverId,
        passengerId,
        confirmationTimeoutMs,
        enableOnchainAttestations,
        onConfirmationReceived: handlePickupConfirmation,
        onTimeoutExpired: handlePickupTimeout,
    });

    const destinationConfirmation = useDriverConfirmation({
        geofenceId: destinationGeofenceId,
        geofenceType: 'destination',
        location: destinationLocation,
        address: destinationAddress,
        rideId,
        driverId,
        passengerId,
        confirmationTimeoutMs,
        enableOnchainAttestations,
        onConfirmationReceived: handleDestinationConfirmation,
        onTimeoutExpired: handleDestinationTimeout,
    });

    // Geofence visibility based on phase
    const geofenceVisibility = useMemo<GeofenceVisibility>(() => {
        switch (navigationPhase) {
            case 'to-pickup':
            case 'at-pickup':
                return { showPickupGeofence: true, showDestinationGeofence: false };
            case 'picking-up':
                return { showPickupGeofence: false, showDestinationGeofence: false };
            case 'to-destination':
            case 'at-destination':
                return { showPickupGeofence: false, showDestinationGeofence: true };
            case 'completed':
            default:
                return { showPickupGeofence: false, showDestinationGeofence: false };
        }
    }, [navigationPhase]);

    // Handle entering pickup geofence
    const handleEnterPickup = useCallback(async () => {
        if (hasEnteredPickupRef.current) return;

        hasEnteredPickupRef.current = true;
        callbacksRef.current.onEnterPickupGeofence();

        setGeofenceState(prev => ({
            ...prev,
            pickup: { ...prev.pickup, isWaitingForConfirmation: true },
        }));

        await pickupConfirmation.startConfirmation();
    }, [pickupConfirmation]);

    // Handle entering destination geofence
    const handleEnterDestination = useCallback(async () => {
        if (hasEnteredDestinationRef.current) return;

        hasEnteredDestinationRef.current = true;
        callbacksRef.current.onEnterDestinationGeofence();

        setGeofenceState(prev => ({
            ...prev,
            destination: { ...prev.destination, isWaitingForConfirmation: true },
        }));

        await destinationConfirmation.startConfirmation();
    }, [destinationConfirmation]);

    // Reset state when phase changes
    useEffect(() => {
        if (navigationPhase === 'to-pickup') {
            hasEnteredPickupRef.current = false;
            pickupConfirmation.resetConfirmation();
        } else if (navigationPhase === 'to-destination') {
            hasEnteredDestinationRef.current = false;
            destinationConfirmation.resetConfirmation();
        } else if (navigationPhase === 'completed') {
            hasEnteredPickupRef.current = false;
            hasEnteredDestinationRef.current = false;
            setIsInPickupGeofence(false);
            setIsInDestinationGeofence(false);
            setGeofenceState(initialGeofenceState);
            pickupConfirmation.resetConfirmation();
            destinationConfirmation.resetConfirmation();
        }
    }, [navigationPhase, pickupConfirmation.resetConfirmation, destinationConfirmation.resetConfirmation]);

    // Main geofence checking logic
    useEffect(() => {
        if (!driverLocation) return;

        const checkGeofences = () => {
            // Check pickup geofence
            if (geofenceVisibility.showPickupGeofence && navigationPhase === 'to-pickup') {
                const distance = getDistance(driverLocation, pickupLocation);
                const isInside = distance <= GEOFENCE_RADIUS_METERS;

                if (isInside !== isInPickupGeofence) {
                    setIsInPickupGeofence(isInside);
                    if (isInside) {
                        console.log('📍 Entered pickup geofence - Distance:', distance, 'm');
                        handleEnterPickup();
                    }
                }
            }

            // Check destination geofence
            if (geofenceVisibility.showDestinationGeofence && navigationPhase === 'to-destination') {
                const distance = getDistance(driverLocation, destinationLocation);
                const isInside = distance <= GEOFENCE_RADIUS_METERS;

                if (isInside !== isInDestinationGeofence) {
                    setIsInDestinationGeofence(isInside);
                    if (isInside) {
                        console.log('📍 Entered destination geofence - Distance:', distance, 'm');
                        handleEnterDestination();
                    }
                }
            }
        };

        // Clear existing interval
        if (geofenceCheckIntervalRef.current) {
            clearInterval(geofenceCheckIntervalRef.current);
        }

        // Check immediately and set up interval
        checkGeofences();
        geofenceCheckIntervalRef.current = setInterval(checkGeofences, GEOFENCE_CHECK_INTERVAL);

        return () => {
            if (geofenceCheckIntervalRef.current) {
                clearInterval(geofenceCheckIntervalRef.current);
                geofenceCheckIntervalRef.current = null;
            }
        };
    }, [
        driverLocation?.latitude,
        driverLocation?.longitude,
        navigationPhase,
        geofenceVisibility.showPickupGeofence,
        geofenceVisibility.showDestinationGeofence,
        isInPickupGeofence,
        isInDestinationGeofence,
        pickupLocation.latitude,
        pickupLocation.longitude,
        destinationLocation.latitude,
        destinationLocation.longitude,
        handleEnterPickup,
        handleEnterDestination,
    ]);

    // Sync timer state from confirmation hooks (only timer/attestation - not full state sync)
    useEffect(() => {
        const updateTimer = () => {
            setGeofenceState(prev => {
                const pickupChanged =
                    prev.pickup.timeRemaining !== pickupConfirmation.timeRemaining ||
                    prev.pickup.entryAttestation !== pickupConfirmation.entryAttestation ||
                    prev.pickup.confirmationAttestation !== pickupConfirmation.confirmationAttestation;
                const destChanged =
                    prev.destination.timeRemaining !== destinationConfirmation.timeRemaining ||
                    prev.destination.entryAttestation !== destinationConfirmation.entryAttestation ||
                    prev.destination.confirmationAttestation !== destinationConfirmation.confirmationAttestation;

                if (!pickupChanged && !destChanged) return prev;

                return {
                    pickup: {
                        ...prev.pickup,
                        timeRemaining: pickupConfirmation.timeRemaining,
                        entryAttestation: pickupConfirmation.entryAttestation ?? prev.pickup.entryAttestation,
                        confirmationAttestation: pickupConfirmation.confirmationAttestation ?? prev.pickup.confirmationAttestation,
                    },
                    destination: {
                        ...prev.destination,
                        timeRemaining: destinationConfirmation.timeRemaining,
                        entryAttestation: destinationConfirmation.entryAttestation ?? prev.destination.entryAttestation,
                        confirmationAttestation: destinationConfirmation.confirmationAttestation ?? prev.destination.confirmationAttestation,
                    },
                };
            });
        };

        updateTimer();
    }, [
        pickupConfirmation.timeRemaining,
        pickupConfirmation.entryAttestation,
        pickupConfirmation.confirmationAttestation,
        destinationConfirmation.timeRemaining,
        destinationConfirmation.entryAttestation,
        destinationConfirmation.confirmationAttestation,
    ]);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (geofenceCheckIntervalRef.current) {
            clearInterval(geofenceCheckIntervalRef.current);
            geofenceCheckIntervalRef.current = null;
        }
        setIsInPickupGeofence(false);
        setIsInDestinationGeofence(false);
        setGeofenceState(initialGeofenceState);
        hasEnteredPickupRef.current = false;
        hasEnteredDestinationRef.current = false;
    }, []);

    // Cleanup on unmount
    useEffect(() => cleanup, [cleanup]);

    // Manual confirmation trigger
    const triggerManualConfirmation = useCallback(async (type: 'pickup' | 'destination') => {
        if (type === 'pickup') {
            setGeofenceState(prev => ({
                ...prev,
                pickup: { ...prev.pickup, isWaitingForConfirmation: true },
            }));
            await pickupConfirmation.startConfirmation();
        } else {
            setGeofenceState(prev => ({
                ...prev,
                destination: { ...prev.destination, isWaitingForConfirmation: true },
            }));
            await destinationConfirmation.startConfirmation();
        }
    }, [pickupConfirmation, destinationConfirmation]);

    // Cancel confirmation
    const cancelConfirmation = useCallback((type: 'pickup' | 'destination') => {
        if (type === 'pickup') {
            pickupConfirmation.cancelConfirmation();
            setGeofenceState(prev => ({
                ...prev,
                pickup: { ...prev.pickup, isWaitingForConfirmation: false },
            }));
        } else {
            destinationConfirmation.cancelConfirmation();
            setGeofenceState(prev => ({
                ...prev,
                destination: { ...prev.destination, isWaitingForConfirmation: false },
            }));
        }
    }, [pickupConfirmation, destinationConfirmation]);

    // Aggregate ride attestations from both confirmation hooks
    const rideAttestations: RideAttestations = useMemo(() => ({
        pickupEntry: geofenceState.pickup.entryAttestation,
        pickupConfirmed: geofenceState.pickup.confirmationAttestation,
        dropoffEntry: geofenceState.destination.entryAttestation,
        dropoffConfirmed: geofenceState.destination.confirmationAttestation,
    }), [
        geofenceState.pickup.entryAttestation,
        geofenceState.pickup.confirmationAttestation,
        geofenceState.destination.entryAttestation,
        geofenceState.destination.confirmationAttestation,
    ]);

    return {
        // Geofencing state
        isInPickupGeofence,
        isInDestinationGeofence,
        geofenceVisibility,
        cleanup,

        // Confirmation state
        geofenceState,
        triggerManualConfirmation,
        cancelConfirmation,

        // Attestation status
        isCreatingAttestation: pickupConfirmation.isCreatingAttestation || destinationConfirmation.isCreatingAttestation,
        attestationError: pickupConfirmation.attestationError || destinationConfirmation.attestationError,
        isWalletConnected: pickupConfirmation.isWalletConnected,
        enableOnchainAttestations,

        // All ride attestations aggregated
        rideAttestations,
    };
};