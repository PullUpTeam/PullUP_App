// hooks/navigation/useEnhancedGeofencing.ts
// Fixed version that prevents infinite re-renders by using refs for callbacks
// and avoiding unnecessary state synchronization effects

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getDistance } from 'geolib';
import { GEOFENCE_CHECK_INTERVAL, GEOFENCE_RADIUS_METERS, NavigationPhase } from "@/hooks/navigation/types";
import { useDriverConfirmation } from '@/hooks/navigation/useDriverConfirmation';
import { OnchainLocationAttestation } from '@/lib/blockchain/astralSDK';

interface UseEnhancedGeofencingProps {
    driverLocation: { latitude: number; longitude: number } | null;
    pickupLocation: { latitude: number; longitude: number };
    destinationLocation: { latitude: number; longitude: number };
    pickupAddress?: string;
    destinationAddress?: string;
    navigationPhase: NavigationPhase;

    // Callbacks for geofence entry (triggers confirmation flow)
    onEnterPickupGeofence: () => void;
    onEnterDestinationGeofence: () => void;

    // Callbacks for passenger confirmation
    onPassengerConfirmation: (type: 'pickup' | 'destination', confirmed: boolean, attestation?: OnchainLocationAttestation) => void;
    onConfirmationTimeout: (type: 'pickup' | 'destination', attestation?: OnchainLocationAttestation) => void;

    // Onchain attestation settings
    enableOnchainAttestations?: boolean;
    confirmationTimeoutMs?: number;
}

interface GeofenceVisibility {
    showPickupGeofence: boolean;
    showDestinationGeofence: boolean;
}

interface GeofenceState {
    pickup: {
        attestation: OnchainLocationAttestation | null;
        isWaitingForConfirmation: boolean;
        hasConfirmed: boolean;
        timeRemaining: number;
    };
    destination: {
        attestation: OnchainLocationAttestation | null;
        isWaitingForConfirmation: boolean;
        hasConfirmed: boolean;
        timeRemaining: number;
    };
}

const initialGeofenceState: GeofenceState = {
    pickup: {
        attestation: null,
        isWaitingForConfirmation: false,
        hasConfirmed: false,
        timeRemaining: 0,
    },
    destination: {
        attestation: null,
        isWaitingForConfirmation: false,
        hasConfirmed: false,
        timeRemaining: 0,
    },
};

export const useEnhancedGeofencing = ({
    driverLocation,
    pickupLocation,
    destinationLocation,
    pickupAddress,
    destinationAddress,
    navigationPhase,
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
    const handlePickupConfirmation = useCallback((confirmed: boolean, attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                hasConfirmed: true,
                isWaitingForConfirmation: false,
                attestation: attestation ?? prev.pickup.attestation,
            },
        }));
        callbacksRef.current.onPassengerConfirmation('pickup', confirmed, attestation);
    }, []);

    const handlePickupTimeout = useCallback((attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            pickup: {
                ...prev.pickup,
                isWaitingForConfirmation: false,
                attestation: attestation ?? prev.pickup.attestation,
            },
        }));
        callbacksRef.current.onConfirmationTimeout('pickup', attestation);
    }, []);

    const handleDestinationConfirmation = useCallback((confirmed: boolean, attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            destination: {
                ...prev.destination,
                hasConfirmed: true,
                isWaitingForConfirmation: false,
                attestation: attestation ?? prev.destination.attestation,
            },
        }));
        callbacksRef.current.onPassengerConfirmation('destination', confirmed, attestation);
    }, []);

    const handleDestinationTimeout = useCallback((attestation?: OnchainLocationAttestation) => {
        setGeofenceState(prev => ({
            ...prev,
            destination: {
                ...prev.destination,
                isWaitingForConfirmation: false,
                attestation: attestation ?? prev.destination.attestation,
            },
        }));
        callbacksRef.current.onConfirmationTimeout('destination', attestation);
    }, []);

    // Driver confirmation hooks
    const pickupConfirmation = useDriverConfirmation({
        geofenceId: pickupGeofenceId,
        geofenceType: 'pickup',
        location: pickupLocation,
        address: pickupAddress,
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
                    prev.pickup.attestation !== pickupConfirmation.attestation;
                const destChanged =
                    prev.destination.timeRemaining !== destinationConfirmation.timeRemaining ||
                    prev.destination.attestation !== destinationConfirmation.attestation;

                if (!pickupChanged && !destChanged) return prev;

                return {
                    pickup: {
                        ...prev.pickup,
                        timeRemaining: pickupConfirmation.timeRemaining,
                        attestation: pickupConfirmation.attestation ?? prev.pickup.attestation,
                    },
                    destination: {
                        ...prev.destination,
                        timeRemaining: destinationConfirmation.timeRemaining,
                        attestation: destinationConfirmation.attestation ?? prev.destination.attestation,
                    },
                };
            });
        };

        updateTimer();
    }, [
        pickupConfirmation.timeRemaining,
        pickupConfirmation.attestation,
        destinationConfirmation.timeRemaining,
        destinationConfirmation.attestation,
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
    };
};